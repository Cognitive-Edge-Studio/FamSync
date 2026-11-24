-- Chat W3: receipts, typing, presence with privacy, and alerts for ordinary channel messages.
create table app.chat_privacy(
 user_id uuid primary key references auth.users(id) on delete cascade,
 share_receipts boolean not null default true,share_presence boolean not null default true
);
alter table app.chat_privacy enable row level security;
grant select on app.chat_privacy to famsync_api;
create policy chat_privacy_self on app.chat_privacy for select to famsync_api using(user_id=app.actor_id());
-- Read only through functions that apply both people's settings.
create table app.user_presence(
 user_id uuid primary key references auth.users(id) on delete cascade,
 online boolean not null,active_at timestamptz not null default clock_timestamp()
);
alter table app.user_presence enable row level security;

create function app.shares_receipts(p_user uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce((select share_receipts from app.chat_privacy where user_id=p_user),true)
$$;
create function app.shares_presence(p_user uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce((select share_presence from app.chat_privacy where user_id=p_user),true)
$$;

-- receipt_read only advances while the reader shares receipts, so turning sharing on never reveals earlier reads.
-- Messages sent before someone joined do not wait for them. Existing history gets no receipts.
alter table app.channel_participants add column joined_position integer not null default 0,
 add column delivered_position integer not null default 0,add column receipt_read integer not null default 0;
update app.channel_participants p set joined_position=c.last_position,delivered_position=c.last_position,receipt_read=c.last_position from app.channels c where c.id=p.channel_id;
create function app.start_participant_receipts() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 select last_position into new.joined_position from app.channels where id=new.channel_id;
 new.delivered_position:=new.joined_position;new.receipt_read:=new.joined_position;return new;
end $$;
create trigger start_participant_receipts before insert on app.channel_participants for each row execute function app.start_participant_receipts();

-- A refresh for named people only. Receipts signal the authors they concern, and nobody else.
create function app.queue_channel_refresh_for(p_id uuid,p_users uuid[]) returns void language sql security definer set search_path=pg_catalog as $$
 insert into app.outbox(kind,family_id,payload,dedupe_key)
  select 'channel.refresh',family_id,jsonb_build_object('channelId',id,'users',to_jsonb(p_users)),'channel:'||gen_random_uuid()::text
  from app.channels where id=p_id and cardinality(p_users)>0
$$;
create function app.message_authors_between(p_channel uuid,p_after integer,p_through integer,p_not uuid) returns uuid[] language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(array_agg(distinct author_id),'{}') from app.channel_messages where channel_id=p_channel and position>p_after and position<=p_through and author_id is not null and author_id<>p_not
$$;

create or replace function app.read_channel(p_family uuid,p_channel uuid,p_position integer) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;p app.channel_participants;actor uuid:=app.actor_id();cleared boolean;notify uuid[];shares boolean:=app.shares_receipts(app.actor_id());
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for share;
 if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Conversation not found' using errcode='P0002'; end if;
 if p_position<0 or p_position>c.last_position then raise exception 'Choose a saved message position' using errcode='22023'; end if;
 select * into p from app.channel_participants where channel_id=p_channel and user_id=actor for update;
 update app.channel_participants set last_read=greatest(last_read,p_position),delivered_position=greatest(delivered_position,p_position),
  receipt_read=case when shares then greatest(receipt_read,p_position) else receipt_read end where channel_id=p_channel and user_id=actor
  and (last_read<p_position or delivered_position<p_position or shares and receipt_read<p_position);
 update app.conversation_alerts a set read_at=clock_timestamp() from app.channel_messages m
 where a.message_id=m.id and a.recipient_id=actor and a.read_at is null and m.channel_id=p_channel and m.position<=greatest(p.last_read,p_position);
 cleared:=found;
 -- Reading privately signals only this person's own devices, plus authors whose message had not been delivered yet.
 notify:=case when shares then app.message_authors_between(p_channel,least(p.receipt_read,p.delivered_position),p_position,actor)
  else app.message_authors_between(p_channel,p.delivered_position,p_position,actor) end;
 if p.last_read<p_position or cleared then notify:=notify||actor;end if;
 perform app.queue_channel_refresh_for(p_channel,notify);
end $$;

create function app.mark_delivered(p_family uuid,p_items jsonb) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare r record;was integer;through_position integer;actor uuid:=app.actor_id();
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'Choose up to 100 conversations' using errcode='22023';end if;
 for r in select distinct on(c.id) c.id,c.last_position,(i->>'position')::integer as position from jsonb_array_elements(p_items) i
  join app.channels c on c.id=(i->>'id')::uuid and c.family_id=p_family order by c.id,(i->>'position')::integer desc loop
  if not app.is_channel_participant(r.id,actor) then continue;end if;
  through_position:=least(r.position,r.last_position);
  select delivered_position into was from app.channel_participants where channel_id=r.id and user_id=actor for update;
  if was is null or was>=through_position then continue;end if;
  update app.channel_participants set delivered_position=through_position where channel_id=r.id and user_id=actor;
  perform app.queue_channel_refresh_for(r.id,app.message_authors_between(r.id,was,through_position,actor));
 end loop;
end $$;

-- What the caller may see about the other participants. Hiding your own receipts or presence also hides other people's.
create function app.conversation_status(p_channel uuid) returns table(user_id uuid,joined_position integer,delivered_position integer,read_position integer,online boolean,last_seen timestamptz)
 language sql stable security definer set search_path=pg_catalog as $$
 select p.user_id,p.joined_position,p.delivered_position,
  case when app.shares_receipts(p.user_id) and app.shares_receipts(app.actor_id()) then p.receipt_read end,
  case when known.ok then coalesce(up.online and up.active_at>clock_timestamp()-interval '100 seconds',false) end,
  case when known.ok then up.active_at end
 from app.channel_participants p join app.channels c on c.id=p.channel_id
 cross join lateral (select p.user_id<>app.actor_id() and app.shares_presence(p.user_id) and app.shares_presence(app.actor_id())
  and exists(select 1 from app.family_memberships m where m.family_id=c.family_id and m.user_id=p.user_id)
  and exists(select 1 from app.family_memberships m where m.family_id=c.family_id and m.user_id=app.actor_id()) as ok) known
 left join app.user_presence up on up.user_id=p.user_id
 where p.channel_id=p_channel and app.is_channel_participant(p_channel,app.actor_id())
$$;
create function app.set_presence(p_online boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if app.actor_id() is null then raise exception 'Missing actor' using errcode='42501';end if;
 if not app.shares_presence(app.actor_id()) then delete from app.user_presence where user_id=app.actor_id();return;end if;
 insert into app.user_presence(user_id,online,active_at) values(app.actor_id(),p_online,clock_timestamp())
  on conflict(user_id) do update set online=excluded.online,active_at=excluded.active_at;
end $$;
create function app.set_chat_privacy(p_receipts boolean,p_presence boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if app.actor_id() is null then raise exception 'Missing actor' using errcode='42501';end if;
 insert into app.chat_privacy(user_id,share_receipts,share_presence) values(app.actor_id(),p_receipts,p_presence)
  on conflict(user_id) do update set share_receipts=excluded.share_receipts,share_presence=excluded.share_presence;
 if not p_presence then delete from app.user_presence where user_id=app.actor_id();end if;
end $$;
-- The jobs role learns only who may receive a typing signal. Nothing about typing is stored.
create function app.typing_recipients(p_channel uuid,p_actor uuid) returns table(user_id uuid) language sql stable security definer set search_path=pg_catalog as $$
 select p.user_id from app.channel_participants p join app.channels c on c.id=p.channel_id
 where p.channel_id=p_channel and c.archived_at is null and p.user_id<>p_actor and app.is_channel_participant(p_channel,p.user_id)
  and app.is_channel_participant(p_channel,p_actor) and app.shares_presence(p_actor) and app.shares_presence(p.user_id)
$$;

-- Ordinary channel messages alert everyone who has not muted the channel. One unread alert per person and channel is
-- kept for them, so a busy chat does not bury other notifications. Mentions stay separate.
create or replace function app.deliver_conversation_notice(p_message uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare m app.channel_messages; c app.channels; people uuid[];
begin
 select * into m from app.channel_messages where id=p_message; if not found then return; end if;
 select * into c from app.channels where id=m.channel_id;
 perform 1 from app.families where id=c.family_id for share;
 select * into c from app.channels where id=m.channel_id for update;
 select * into m from app.channel_messages where id=p_message;
 if c.id is null or c.archived_at is not null or m.id is null or m.deleted_at is not null then return; end if;
 with saved as (
  insert into app.conversation_alerts as a(family_id,message_id,recipient_id,kind,read_at)
   select c.family_id,m.id,p.user_id,case when p.user_id=any(m.mentioned_user_ids) then 'mention' else 'message' end,
    case when p.last_read>=m.position then clock_timestamp() end
   from app.channel_participants p where p.channel_id=c.id and not p.muted and p.user_id is distinct from m.author_id
   and app.is_channel_participant(c.id,p.user_id)
   on conflict(message_id,recipient_id) do update set kind='mention',read_at=excluded.read_at where a.kind='message' and excluded.kind='mention'
   returning a.recipient_id
 ) select coalesce(array_agg(recipient_id),'{}') into people from saved;
 if c.kind='channel' then
  delete from app.conversation_alerts a using app.channel_messages old where old.id=a.message_id and old.channel_id=c.id and old.position<m.position
   and a.kind='message' and a.read_at is null and a.recipient_id=any(people);
 end if;
 perform app.queue_channel_refresh_for(c.id,people);
end $$;

do $$ declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace='app'::regnamespace and p.proname=any(array['shares_receipts','shares_presence','start_participant_receipts',
  'queue_channel_refresh_for','message_authors_between','mark_delivered','conversation_status','set_presence','set_chat_privacy','typing_recipients']) loop
  execute format('revoke all on function %s from public',fn);
 end loop;
end $$;
grant execute on function app.mark_delivered(uuid,jsonb),app.conversation_status(uuid),app.set_presence(boolean),app.set_chat_privacy(boolean,boolean) to famsync_api;
grant execute on function app.typing_recipients(uuid,uuid) to famsync_jobs;
