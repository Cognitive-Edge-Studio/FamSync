-- Change markers let clients fetch only new or changed messages. The counter lives apart from app.channels:
-- task and event writes already hold a share lock on the channel and must not upgrade it.
create table app.channel_change_counters(
 channel_id uuid primary key references app.channels(id) on delete cascade,
 seq integer not null default 0
);
insert into app.channel_change_counters(channel_id,seq) select id,last_position from app.channels;
alter table app.channel_change_counters enable row level security;
grant select on app.channel_change_counters to famsync_api;
create policy channel_change_counters_read on app.channel_change_counters for select to famsync_api using(app.can_access_channel(channel_id));

alter table app.channel_messages add column change_seq integer not null default 0;
update app.channel_messages set change_seq=position;
create index channel_messages_by_change on app.channel_messages(channel_id,change_seq);

create function app.start_channel_changes() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin insert into app.channel_change_counters(channel_id) values(new.id) on conflict do nothing;return new;end $$;
revoke all on function app.start_channel_changes() from public;
create trigger start_channel_changes after insert on app.channels for each row execute function app.start_channel_changes();

-- The counter row stays locked until commit, so a visible sequence means every earlier change is visible too.
create function app.mark_new_message() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 update app.channel_change_counters set seq=seq+1 where channel_id=new.channel_id returning seq into strict new.change_seq;
 return new;
end $$;
revoke all on function app.mark_new_message() from public;
create trigger mark_new_message before insert on app.channel_messages for each row execute function app.mark_new_message();

create function app.touch_messages(p_ids uuid[]) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare r record;n integer;
begin
 -- A fixed channel order prevents two writers from waiting on each other.
 for r in select id,channel_id from app.channel_messages where id=any(p_ids) order by channel_id,position loop
  update app.channel_change_counters set seq=seq+1 where channel_id=r.channel_id returning seq into n;
  if found then update app.channel_messages set change_seq=n where id=r.id;end if;
 end loop;
end $$;
revoke all on function app.touch_messages(uuid[]) from public;

create function app.touch_from_message_row() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then perform app.touch_messages(array[old.message_id]);return old;end if;
 perform app.touch_messages(array[new.message_id]);return new;
end $$;
revoke all on function app.touch_from_message_row() from public;
create trigger touch_reaction after insert or delete on app.channel_reactions for each row execute function app.touch_from_message_row();
create trigger touch_event_link after insert or delete on app.message_event_links for each row execute function app.touch_from_message_row();
create trigger touch_file_link after insert or delete on app.message_file_links for each row execute function app.touch_from_message_row();

create function app.touch_from_task() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform app.touch_messages(array_remove(array[case when tg_op<>'INSERT' then old.source_message_id end,case when tg_op<>'DELETE' then new.source_message_id end],null));
 return null;
end $$;
revoke all on function app.touch_from_task() from public;
create trigger touch_task_source after insert or delete or update of source_message_id,title,archived_at,audience,selected_member_ids on app.tasks
 for each row execute function app.touch_from_task();

create function app.touch_from_event() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin perform app.touch_messages(array(select message_id from app.message_event_links where event_id=new.id));return null;end $$;
revoke all on function app.touch_from_event() from public;
create trigger touch_event_source after update of title,audience,selected_member_ids on app.calendar_events for each row execute function app.touch_from_event();

create function app.touch_from_file() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin perform app.touch_messages(array(select message_id from app.message_file_links where file_id=new.id));return null;end $$;
revoke all on function app.touch_from_file() from public;
create trigger touch_file_source after update of archived_at,state on app.stored_files for each row execute function app.touch_from_file();

create function app.touch_from_folder() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin perform app.touch_messages(array(select l.message_id from app.message_file_links l join app.stored_files f on f.id=l.file_id where f.folder_id=new.id));return null;end $$;
revoke all on function app.touch_from_folder() from public;
create trigger touch_folder_source after update of archived_at,audience,selected_member_ids on app.folders for each row execute function app.touch_from_folder();

-- Replies may answer any message in the conversation. A repeat of a saved message returns first, so a retry
-- still succeeds after a mentioned person leaves or the channel is archived.
create or replace function app.post_conversation_message(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid,p_mentions uuid[]) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; existing app.channel_messages; actor uuid:=app.actor_id(); mentions uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Conversation not found' using errcode='P0002'; end if;
 mentions:=array(select distinct u from unnest(coalesce(p_mentions,'{}')) u order by u);
 select * into existing from app.channel_messages where id=p_id;
 if found then
  if existing.channel_id=p_channel and existing.author_id=actor and existing.body=btrim(p_body)
   and existing.reply_to_id is not distinct from p_reply and existing.mentioned_user_ids=mentions then return; end if;
  raise exception 'Message ID already in use' using errcode='23505'; end if;
 if c.archived_at is not null then raise exception 'Restore this channel before posting' using errcode='22023'; end if;
 if cardinality(mentions)>100 or exists(select 1 from unnest(mentions) u where u is null or not app.is_channel_participant(c.id,u)) then
  raise exception 'Mention only current conversation members' using errcode='22023'; end if;
 if p_reply is not null and not exists(select 1 from app.channel_messages where id=p_reply and channel_id=p_channel) then
  raise exception 'Reply to a message in this conversation' using errcode='22023'; end if;
 update app.channels set last_position=last_position+1 where id=p_channel;
 insert into app.channel_messages(id,channel_id,author_id,position,body,reply_to_id,mentioned_user_ids)
  values(p_id,p_channel,actor,c.last_position+1,btrim(p_body),p_reply,mentions);
 perform app.queue_channel_refresh(p_channel);
 insert into app.outbox(kind,family_id,payload,dedupe_key) values('conversation.notice',p_family,jsonb_build_object('messageId',p_id),'conversation-notice:'||p_id::text);
end $$;
