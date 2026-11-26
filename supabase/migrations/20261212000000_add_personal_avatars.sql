-- Selfies and previews are private to their owner. Only the accepted portrait is shared.
create table app.avatar_generations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'uploading' check (status in ('uploading','queued','working','ready','failed','expired')),
  input_hash text not null,
  error text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  unique(user_id,id)
);
create index avatar_generations_owner on app.avatar_generations(user_id,created_at desc);
alter table app.avatar_generations enable row level security;
grant select, insert, update on app.avatar_generations to famsync_api;
create policy avatar_generations_self on app.avatar_generations for all to famsync_api
  using(user_id=app.actor_id()) with check(user_id=app.actor_id());
alter table app.profiles add column avatar_generation_id uuid;
alter table app.profiles add foreign key(user_id,avatar_generation_id) references app.avatar_generations(user_id,id);

-- Serialize reservations, so retries and simultaneous taps consume only one slot.
create function app.reserve_avatar(p_id uuid,p_hash text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=app.actor_id(); existing app.avatar_generations;
begin
  if actor is null then raise exception 'Sign in first' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar:'||actor::text,0));
  select * into existing from app.avatar_generations where id=p_id;
  if found then
    if existing.user_id<>actor or existing.input_hash<>p_hash then raise exception 'Upload does not match' using errcode='22023'; end if;
    return existing.id;
  end if;
  if (select count(*) from app.avatar_generations where user_id=actor and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=5 then
    raise exception 'You have used today''s 5 avatar attempts. Try again tomorrow (UTC).' using errcode='P0001';
  end if;
  if exists(select 1 from app.avatar_generations where user_id=actor and status in('queued','working') and expires_at>now()) then
    raise exception 'An avatar is already being created. Wait for it to finish.' using errcode='22023';
  end if;
  insert into app.avatar_generations(id,user_id,input_hash) values(p_id,actor,p_hash);
  -- Even an interrupted upload is eventually removed. The cleanup also handles replaced avatars.
  insert into app.outbox(kind,payload,dedupe_key,available_at) values
    ('avatar.cleanup',jsonb_build_object('actorId',actor,'generationId',p_id),'avatar-cleanup:'||p_id::text,now()+interval '24 hours');
  return p_id;
end $$;
revoke all on function app.reserve_avatar(uuid,text) from public;
grant execute on function app.reserve_avatar(uuid,text) to famsync_api;

-- A narrow lookup: shared family, or current participants in a shared conversation (including guests).
create function app.visible_avatars(p_users uuid[]) returns table(user_id uuid,generation_id uuid)
language sql stable security definer set search_path=pg_catalog as $$
  select p.user_id,p.avatar_generation_id from app.profiles p
  where p.user_id=any(p_users) and p.avatar_generation_id is not null and (
    p.user_id=app.actor_id() or exists (
      select 1 from app.family_memberships a join app.family_memberships b on b.family_id=a.family_id
      where a.user_id=app.actor_id() and b.user_id=p.user_id
    ) or exists (
      select 1 from app.channel_participants a join app.channel_participants b on b.channel_id=a.channel_id
      where a.user_id=app.actor_id() and b.user_id=p.user_id
        and app.is_channel_participant(a.channel_id,app.actor_id()) and app.is_channel_participant(a.channel_id,p.user_id)
    )
  )
$$;
revoke all on function app.visible_avatars(uuid[]) from public;
grant execute on function app.visible_avatars(uuid[]) to famsync_api;
