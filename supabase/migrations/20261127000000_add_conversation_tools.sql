alter table app.channels add column kind text not null default 'channel' check(kind in ('channel','dm'));
alter table app.channels add column pair_low uuid references auth.users(id) on delete cascade;
alter table app.channels add column pair_high uuid references auth.users(id) on delete cascade;
alter table app.channels add constraint conversation_pair_shape check(
 (kind='channel' and pair_low is null and pair_high is null) or
 (kind='dm' and pair_low is not null and pair_high is not null and pair_low<pair_high and manager_id is null));
create unique index direct_conversation_pair on app.channels(family_id,pair_low,pair_high) where kind='dm';
alter table app.channel_participants add column muted boolean not null default false;
alter table app.channel_messages add column mentioned_user_ids uuid[] not null default '{}' check(cardinality(mentioned_user_ids)<=100);

create or replace function app.is_channel_participant(p_channel uuid,p_user uuid) returns boolean
 language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.channels c join app.channel_participants p on p.channel_id=c.id
  join app.family_memberships fm on fm.family_id=c.family_id and fm.user_id=p.user_id
  where c.id=p_channel and p.user_id=p_user and (c.kind='channel' or
   (p_user in(c.pair_low,c.pair_high) and exists(select 1 from app.channel_participants other
    join app.family_memberships om on om.family_id=other.family_id and om.user_id=other.user_id
    where other.channel_id=c.id and other.user_id=case when p_user=c.pair_low then c.pair_high else c.pair_low end))))
$$;

create function app.open_direct_conversation(p_family uuid,p_peer uuid) returns uuid
 language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=app.actor_id(); saved uuid; low_id uuid:=least(actor,p_peer); high_id uuid:=greatest(actor,p_peer);
begin
 perform 1 from app.families where id=p_family for share;
 if actor is null or p_peer is null or actor=p_peer or
  (select count(*) from app.family_memberships where family_id=p_family and user_id in(actor,p_peer))<>2 then
  raise exception 'Choose another current family member' using errcode='22023'; end if;
 insert into app.channels(id,family_id,author_id,manager_id,name,kind,pair_low,pair_high)
  values(gen_random_uuid(),p_family,actor,null,'Direct conversation','dm',low_id,high_id)
  on conflict(family_id,pair_low,pair_high) where kind='dm' do nothing;
 select id into saved from app.channels where family_id=p_family and kind='dm' and pair_low=low_id and pair_high=high_id for update;
 insert into app.channel_participants(channel_id,family_id,user_id,last_read)
  select saved,p_family,u,c.last_position from unnest(array[actor,p_peer]) u cross join app.channels c where c.id=saved
  on conflict do nothing;
 perform app.queue_channel_refresh(saved);
 return saved;
end $$;
revoke all on function app.open_direct_conversation(uuid,uuid) from public;
grant execute on function app.open_direct_conversation(uuid,uuid) to famsync_api;

create function app.guard_direct_conversation() returns trigger
 language plpgsql set search_path=pg_catalog as $$
begin
 if new.kind is distinct from old.kind or new.pair_low is distinct from old.pair_low or new.pair_high is distinct from old.pair_high
  or new.family_id is distinct from old.family_id then raise exception 'Conversation identity is fixed' using errcode='22023'; end if;
 if old.kind='dm' and (new.name,new.emoji,new.topic,new.description,new.archived_at,new.manager_id)
  is distinct from (old.name,old.emoji,old.topic,old.description,old.archived_at,old.manager_id) then
  raise exception 'Direct conversation details and members are fixed' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function app.guard_direct_conversation() from public;
create trigger guard_direct_conversation before update on app.channels for each row execute function app.guard_direct_conversation();

create or replace function app.after_channel_participant_removed() returns trigger
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; successor uuid;
begin
 select * into c from app.channels where id=old.channel_id for update;
 if c.id is null then return old; end if;
 if c.kind='channel' and (c.manager_id=old.user_id or c.manager_id is null) then
  select p.user_id into successor from app.channel_participants p join app.family_memberships m
   on m.family_id=p.family_id and m.user_id=p.user_id where p.channel_id=c.id order by p.joined_at,p.user_id limit 1;
  update app.channels set manager_id=successor,version=version+1,updated_at=clock_timestamp(),
   archived_at=case when successor is null then coalesce(archived_at,clock_timestamp()) else archived_at end where id=c.id;
 end if;
 perform app.queue_channel_refresh(c.id); return old;
end $$;
create or replace function app.channel_signal_recipients(p_channel uuid) returns table(user_id uuid)
 language sql stable security definer set search_path=pg_catalog as $$
 select p.user_id from app.channel_participants p where p.channel_id=p_channel and app.is_channel_participant(p_channel,p.user_id)
$$;

create function app.mute_conversation(p_family uuid,p_channel uuid,p_muted boolean) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from app.families where id=p_family for share;
 perform 1 from app.channels where id=p_channel and family_id=p_family for update;
 if not found or not app.is_channel_participant(p_channel,app.actor_id()) then raise exception 'Conversation not found' using errcode='P0002'; end if;
 update app.channel_participants set muted=p_muted where channel_id=p_channel and user_id=app.actor_id();
 perform app.queue_channel_refresh(p_channel);
end $$;
revoke all on function app.mute_conversation(uuid,uuid,boolean) from public;
grant execute on function app.mute_conversation(uuid,uuid,boolean) to famsync_api;

create function app.post_conversation_message(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid,p_mentions uuid[]) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; existing app.channel_messages; parent app.channel_messages; actor uuid:=app.actor_id(); mentions uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Conversation not found' using errcode='P0002'; end if;
 mentions:=array(select distinct u from unnest(coalesce(p_mentions,'{}')) u order by u);
 if cardinality(mentions)>100 or exists(select 1 from unnest(mentions) u where u is null or not app.is_channel_participant(c.id,u)) then
  raise exception 'Mention only current conversation members' using errcode='22023'; end if;
 select * into existing from app.channel_messages where id=p_id;
 if found then
  if existing.channel_id=p_channel and existing.author_id=actor and existing.body=btrim(p_body)
   and existing.reply_to_id is not distinct from p_reply and existing.mentioned_user_ids=mentions then return; end if;
  raise exception 'Message ID already in use' using errcode='23505'; end if;
 if c.archived_at is not null then raise exception 'Restore this channel before posting' using errcode='22023'; end if;
 if p_reply is not null then
  select * into parent from app.channel_messages where id=p_reply and channel_id=p_channel;
  if parent.id is null or parent.reply_to_id is not null then raise exception 'Reply to an original message in this conversation' using errcode='22023'; end if;
 end if;
 update app.channels set last_position=last_position+1 where id=p_channel;
 insert into app.channel_messages(id,channel_id,author_id,position,body,reply_to_id,mentioned_user_ids)
  values(p_id,p_channel,actor,c.last_position+1,btrim(p_body),p_reply,mentions);
 perform app.queue_channel_refresh(p_channel);
 insert into app.outbox(kind,family_id,payload,dedupe_key) values('conversation.notice',p_family,jsonb_build_object('messageId',p_id),'conversation-notice:'||p_id::text);
end $$;
revoke all on function app.post_conversation_message(uuid,uuid,uuid,text,uuid,uuid[]) from public;
grant execute on function app.post_conversation_message(uuid,uuid,uuid,text,uuid,uuid[]) to famsync_api;
create or replace function app.post_channel_message(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid) returns void
 language sql security definer set search_path=pg_catalog as $$
 select app.post_conversation_message(p_family,p_channel,p_id,p_body,p_reply,'{}'::uuid[])
$$;

create table app.conversation_alerts(
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references app.families(id) on delete cascade,
 message_id uuid not null references app.channel_messages(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in('message','mention')),
 created_at timestamptz not null default clock_timestamp(),read_at timestamptz,
 unique(message_id,recipient_id)
);
create index conversation_alerts_inbox on app.conversation_alerts(recipient_id,created_at desc,id);
alter table app.conversation_alerts enable row level security;
grant select on app.conversation_alerts to famsync_api;
grant update(read_at) on app.conversation_alerts to famsync_api;
create policy conversation_alerts_self on app.conversation_alerts for select to famsync_api using(recipient_id=app.actor_id());
create policy conversation_alerts_read on app.conversation_alerts for update to famsync_api using(recipient_id=app.actor_id()) with check(recipient_id=app.actor_id());
create function app.deliver_conversation_notice(p_message uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare m app.channel_messages; c app.channels;
begin
 select * into m from app.channel_messages where id=p_message; if not found then return; end if;
 select * into c from app.channels where id=m.channel_id;
 perform 1 from app.families where id=c.family_id for share;
 select * into c from app.channels where id=m.channel_id for share;
 if c.id is null or c.archived_at is not null then return; end if;
 insert into app.conversation_alerts(family_id,message_id,recipient_id,kind)
  select c.family_id,m.id,p.user_id,case when p.user_id=any(m.mentioned_user_ids) then 'mention' else 'message' end
  from app.channel_participants p where p.channel_id=c.id and not p.muted and p.user_id is distinct from m.author_id
  and app.is_channel_participant(c.id,p.user_id) and (c.kind='dm' or p.user_id=any(m.mentioned_user_ids))
  on conflict(message_id,recipient_id) do nothing;
 if found then perform app.queue_channel_refresh(c.id); end if;
end $$;
revoke all on function app.deliver_conversation_notice(uuid) from public;
grant execute on function app.deliver_conversation_notice(uuid) to famsync_jobs;

alter table app.tasks add column source_message_id uuid references app.channel_messages(id) on delete set null;
create index tasks_by_message on app.tasks(source_message_id) where source_message_id is not null;
create function app.assert_message_task_audience(p_message uuid,p_family uuid,p_author uuid,p_audience app.item_audience,p_selected uuid[],p_version integer default null) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; intended uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select ch.* into c from app.channels ch join app.channel_messages m on m.channel_id=ch.id where m.id=p_message and ch.family_id=p_family for share of ch;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Source message not found' using errcode='P0002'; end if;
 if p_author is distinct from app.actor_id() then raise exception 'Only the task creator can change its source' using errcode='42501'; end if;
 if p_version is not null and c.version<>p_version then raise exception 'Conversation changed. Reload before creating the task.' using errcode='40001'; end if;
 intended:=case when p_audience='private' then array[p_author] else p_selected||p_author end;
 if p_audience='family' or exists(select 1 from unnest(intended) u where not app.is_channel_participant(c.id,u)) then
  raise exception 'Choose only current conversation members, or unlink the source before widening visibility' using errcode='22023'; end if;
end $$;
revoke all on function app.assert_message_task_audience(uuid,uuid,uuid,app.item_audience,uuid[],integer) from public;
grant execute on function app.assert_message_task_audience(uuid,uuid,uuid,app.item_audience,uuid[],integer) to famsync_api;
create function app.guard_message_task_source() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.source_message_id is not null then perform app.assert_message_task_audience(new.source_message_id,new.family_id,new.author_id,new.audience,new.selected_member_ids,null); end if;
 return new;
end $$;
revoke all on function app.guard_message_task_source() from public;
create trigger guard_message_task_source before insert or update of source_message_id,audience,selected_member_ids,author_id,family_id on app.tasks
 for each row execute function app.guard_message_task_source();
create function app.refresh_message_task_source() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare source uuid;
begin
 source:=case when tg_op='INSERT' then new.source_message_id else coalesce(new.source_message_id,old.source_message_id) end;
 if source is not null then perform app.queue_channel_refresh((select channel_id from app.channel_messages where id=source)); end if;
 return new;
end $$;
revoke all on function app.refresh_message_task_source() from public;
create trigger refresh_message_task_source after insert or update of source_message_id,title,archived_at on app.tasks for each row execute function app.refresh_message_task_source();
create function app.unlink_task_message(p_family uuid,p_task uuid,p_version integer) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare t app.tasks;
begin
 perform 1 from app.families where id=p_family for share;
 select * into t from app.tasks where id=p_task and family_id=p_family for update;
 if t.id is null or not app.can_view_family_item(t.family_id,t.author_id,t.audience,t.selected_member_ids) then raise exception 'Task not found' using errcode='P0002'; end if;
 if t.author_id<>app.actor_id() then raise exception 'Only the task creator can unlink its source' using errcode='42501'; end if;
 if t.version<>p_version then raise exception 'Task changed. Reload before unlinking.' using errcode='40001'; end if;
 if t.source_message_id is not null then update app.tasks set source_message_id=null where id=p_task; end if;
end $$;
revoke all on function app.unlink_task_message(uuid,uuid,integer) from public;
grant execute on function app.unlink_task_message(uuid,uuid,integer) to famsync_api;

create table app.message_event_links(
 id uuid primary key,message_id uuid not null references app.channel_messages(id) on delete cascade,
 event_id uuid not null references app.calendar_events(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade, unique(message_id,event_id)
);
alter table app.message_event_links enable row level security;
grant select on app.message_event_links to famsync_api;
create policy message_event_links_read on app.message_event_links for select to famsync_api using(
 exists(select 1 from app.channel_messages m where m.id=message_id) or exists(select 1 from app.calendar_events e where e.id=event_id));
create function app.link_message_event(p_family uuid,p_channel uuid,p_message uuid,p_id uuid,p_event uuid,p_version integer) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; e app.calendar_events;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) or not exists(select 1 from app.channel_messages where id=p_message and channel_id=c.id) then
  raise exception 'Message not found' using errcode='P0002'; end if;
 if c.archived_at is not null then raise exception 'Restore the conversation before linking work' using errcode='22023'; end if;
 if c.version<>p_version then raise exception 'Conversation changed. Reload before linking.' using errcode='40001'; end if;
 select * into e from app.calendar_events where id=p_event and family_id=p_family for share;
 if e.id is null or not app.can_view_family_item(e.family_id,e.author_id,e.audience,e.selected_member_ids) then raise exception 'Event not found' using errcode='P0002'; end if;
 insert into app.message_event_links(id,message_id,event_id,author_id) values(p_id,p_message,p_event,app.actor_id())
  on conflict(message_id,event_id) do nothing;
 perform app.queue_channel_refresh(c.id);
end $$;
revoke all on function app.link_message_event(uuid,uuid,uuid,uuid,uuid,integer) from public;
grant execute on function app.link_message_event(uuid,uuid,uuid,uuid,uuid,integer) to famsync_api;
create function app.unlink_message_event(p_family uuid,p_message uuid,p_link uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; link app.message_event_links;
begin
 perform 1 from app.families where id=p_family for share;
 select ch.* into c from app.channels ch join app.channel_messages m on m.channel_id=ch.id where m.id=p_message and ch.family_id=p_family for update of ch;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Message not found' using errcode='P0002'; end if;
 select * into link from app.message_event_links where id=p_link and message_id=p_message;
 if not found then return; end if;
 if link.author_id<>app.actor_id() then raise exception 'Only the person who linked the event can unlink it' using errcode='42501'; end if;
 delete from app.message_event_links where id=p_link; perform app.queue_channel_refresh(c.id);
end $$;
revoke all on function app.unlink_message_event(uuid,uuid,uuid) from public;
grant execute on function app.unlink_message_event(uuid,uuid,uuid) to famsync_api;
