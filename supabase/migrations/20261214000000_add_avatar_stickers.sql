create table app.avatar_sticker_packs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id uuid not null references app.avatar_generations(id) on delete cascade,
  status text not null default 'queued' check(status in('queued','working','ready','failed','expired')),
  attempts integer not null default 1,
  error text,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,avatar_id)
);
alter table app.avatar_sticker_packs enable row level security;
grant select,update on app.avatar_sticker_packs to famsync_api;
create policy avatar_sticker_packs_self on app.avatar_sticker_packs for all to famsync_api
  using(user_id=app.actor_id()) with check(user_id=app.actor_id());

create function app.reserve_avatar_stickers(p_id uuid) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=app.actor_id(); avatar uuid; pack app.avatar_sticker_packs;
begin
  if actor is null then raise exception 'Sign in first' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar-stickers:'||actor::text,0));
  select avatar_generation_id into avatar from app.profiles where user_id=actor;
  if avatar is null then raise exception 'Save an avatar in Account → Profile first.' using errcode='22023';end if;
  select * into pack from app.avatar_sticker_packs where user_id=actor and avatar_id=avatar for update;
  if found then
    if pack.status in('queued','working','ready') then return pack.id;end if;
    if pack.attempts>=2 then raise exception 'This avatar''s stickers could not be created. Save a new avatar to try again.' using errcode='22023';end if;
    update app.avatar_sticker_packs set status='queued',error=null,attempts=attempts+1 where id=pack.id;
    p_id:=pack.id;
  else
    if (select count(*) from app.avatar_sticker_packs where user_id=actor and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=2 then
      raise exception 'You can create stickers for two avatars per UTC day. Try again tomorrow.' using errcode='P0001';end if;
    insert into app.avatar_sticker_packs(id,user_id,avatar_id) values(p_id,actor,avatar);
  end if;
  insert into app.outbox(kind,payload,dedupe_key) values('stickers.generate',jsonb_build_object('actorId',actor,'packId',p_id),'stickers-generate:'||p_id::text||':'||gen_random_uuid()::text);
  insert into app.outbox(kind,payload,dedupe_key,available_at) values('stickers.cleanup',jsonb_build_object('actorId',actor,'packId',p_id),'stickers-expire:'||p_id::text||':'||gen_random_uuid()::text,now()+interval '24 hours');
  return p_id;
end $$;
revoke all on function app.reserve_avatar_stickers(uuid) from public;
grant execute on function app.reserve_avatar_stickers(uuid) to famsync_api;

create function app.queue_sticker_pack_cleanup() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_table_name='avatar_generations' then
    if new.status='expired' and old.status is distinct from new.status then
      insert into app.outbox(kind,payload,dedupe_key)
      select 'stickers.cleanup',jsonb_build_object('actorId',p.user_id,'packId',p.id),'stickers-reset:'||p.id::text||':'||gen_random_uuid()::text
      from app.avatar_sticker_packs p where p.avatar_id=new.id;
    end if;
    return new;
  end if;
  insert into app.outbox(kind,payload,dedupe_key) values('stickers.cleanup',jsonb_build_object('actorId',old.user_id,'packId',old.id),'stickers-deleted:'||old.id::text);
  return old;
end $$;
revoke all on function app.queue_sticker_pack_cleanup() from public;
create trigger queue_reset_sticker_cleanup after update of status on app.avatar_generations for each row execute function app.queue_sticker_pack_cleanup();
create trigger queue_deleted_sticker_cleanup after delete on app.avatar_sticker_packs for each row execute function app.queue_sticker_pack_cleanup();

-- Sent stickers are independent conversation files; replacing an avatar never removes chat history.
alter table app.stored_files add column sticker boolean not null default false;
grant select(sticker) on app.stored_files to famsync_api;
create function app.mark_avatar_sticker_file(p_family uuid,p_file uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  update app.stored_files f set sticker=true from app.folders d where f.id=p_file and f.family_id=p_family and f.folder_id=d.id
    and f.author_id=app.actor_id() and f.mime='image/webp' and f.state='ready' and f.archived_at is null
    and d.channel_id is not null and app.is_channel_participant(d.channel_id,app.actor_id());
  if not found then raise exception 'Sticker file not found' using errcode='P0002';end if;
end $$;
revoke all on function app.mark_avatar_sticker_file(uuid,uuid) from public;
grant execute on function app.mark_avatar_sticker_file(uuid,uuid) to famsync_api;

-- Repeated sends reuse a conversation copy, so stickers do not fill the chat-upload folder.
create function app.find_avatar_sticker_copy(p_family uuid,p_channel uuid,p_hash text) returns uuid
language sql stable security definer set search_path=pg_catalog as $$
  select f.id from app.stored_files f join app.folders d on d.id=f.folder_id
  where f.family_id=p_family and d.channel_id=p_channel and f.author_id=app.actor_id()
    and f.content_hash=p_hash and f.sticker and f.state='ready' and f.archived_at is null and d.archived_at is null
    and app.is_channel_participant(p_channel,app.actor_id()) order by f.created_at limit 1
$$;
revoke all on function app.find_avatar_sticker_copy(uuid,uuid,text) from public;
grant execute on function app.find_avatar_sticker_copy(uuid,uuid,text) to famsync_api;
