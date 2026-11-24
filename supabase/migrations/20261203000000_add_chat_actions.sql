-- Chat W2: edit, delete, forward, pin, star, any emoji, personal list preferences, several admins and direct uploads.
alter table app.channel_messages drop constraint channel_messages_body_check;
alter table app.channel_messages add constraint channel_messages_body_check check(char_length(body)<=4000);
alter table app.channel_messages add column edited_at timestamptz,add column edit_count integer not null default 0,
 add column deleted_at timestamptz,add column forwarded boolean not null default false;
alter table app.channel_reactions drop constraint channel_reactions_emoji_check;
alter table app.channel_reactions add constraint channel_reactions_emoji_check check(char_length(emoji) between 1 and 32 and emoji !~ '[A-Za-z<>&"[:space:][:cntrl:]]');
alter table app.channel_participants add column admin boolean not null default false,add column pinned_at timestamptz,
 add column hidden_at timestamptz,add column marked_unread boolean not null default false;
alter table app.folders add column chat_uploads boolean not null default false;

-- Admins: the manager, plus any family participant given the role. Guests are never admins.
create function app.is_channel_admin(p_channel uuid,p_user uuid) returns boolean
 language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.channels c join app.channel_participants p on p.channel_id=c.id and p.user_id=p_user
  join app.family_memberships m on m.family_id=c.family_id and m.user_id=p_user
  where c.id=p_channel and c.kind='channel' and (c.manager_id=p_user or p.admin))
$$;
revoke all on function app.is_channel_admin(uuid,uuid) from public;
grant execute on function app.is_channel_admin(uuid,uuid) to famsync_api;

-- Give admins what only the manager could do. Each replacement must apply, or the migration stops.
do $$
declare r record;def text;changed text;
begin
 for r in select * from (values
  ('change_channel','c.manager_id is distinct from app.actor_id()','not app.is_channel_admin(c.id,app.actor_id())'),
  ('finalize_stored_file','c.manager_id is distinct from app.actor_id()','not app.is_channel_admin(c.id,app.actor_id())'),
  ('reserve_stored_file','c.manager_id is distinct from app.actor_id()','not app.is_channel_admin(c.id,app.actor_id())'),
  ('remove_channel_image','c.manager_id is distinct from app.actor_id()','not app.is_channel_admin(c.id,app.actor_id())'),
  ('unlink_message_file','c.manager_id is distinct from app.actor_id()','not app.is_channel_admin(c.id,app.actor_id())'),
  ('invite_channel_guest','c.manager_id is distinct from app.actor_id()','not app.is_channel_admin(c.id,app.actor_id())'),
  ('resend_channel_guest','c.manager_id is distinct from app.actor_id()','not app.is_channel_admin(c.id,app.actor_id())'),
  ('accept_channel_guest','c.manager_id is distinct from i.invited_by','not app.is_channel_admin(c.id,i.invited_by)'),
  ('guest_invitation_for_delivery','c.manager_id=i.invited_by','app.is_channel_admin(c.id,i.invited_by)'),
  ('folder_can_manage','c.manager_id=app.actor_id()','app.is_channel_admin(c.id,app.actor_id())'),
  ('is_guest_admin','c.manager_id=m.user_id','app.is_channel_admin(c.id,m.user_id)'),
  ('after_channel_participant_removed','order by p.joined_at','order by p.admin desc,p.joined_at')
 ) v(name,old,new) loop
  select pg_get_functiondef(p.oid) into strict def from pg_proc p where p.pronamespace='app'::regnamespace and p.proname=r.name;
  changed:=replace(replace(def,r.old,r.new),'Only the channel manager','Only a channel admin');
  if position(r.new in changed)=0 then raise exception 'Could not update %',r.name;end if;
  execute changed;
 end loop;
end $$;

create function app.set_channel_admin(p_family uuid,p_channel uuid,p_version integer,p_user uuid,p_admin boolean) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Channel not found' using errcode='P0002';end if;
 if not app.is_channel_admin(c.id,app.actor_id()) then raise exception 'Only a channel admin can make this change' using errcode='42501';end if;
 if c.version is distinct from p_version then raise exception 'This channel changed. Reload before saving.' using errcode='40001';end if;
 if not exists(select 1 from app.channel_participants p join app.family_memberships m on m.family_id=c.family_id and m.user_id=p.user_id where p.channel_id=c.id and p.user_id=p_user) then
  raise exception 'Choose a family member in this channel' using errcode='22023';end if;
 if p_user=c.manager_id then raise exception 'The manager is always an admin. Hand over the channel first.' using errcode='22023';end if;
 update app.channel_participants set admin=p_admin where channel_id=c.id and user_id=p_user;
 update app.channels set version=version+1,updated_at=clock_timestamp() where id=c.id;
 perform app.queue_channel_refresh(c.id);
end $$;

create function app.hand_over_channel(p_family uuid,p_channel uuid,p_version integer,p_user uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Channel not found' using errcode='P0002';end if;
 if c.manager_id is distinct from app.actor_id() then raise exception 'Only the channel manager can hand it over' using errcode='42501';end if;
 if c.version is distinct from p_version then raise exception 'This channel changed. Reload before saving.' using errcode='40001';end if;
 if p_user=c.manager_id or not exists(select 1 from app.channel_participants p join app.family_memberships m on m.family_id=c.family_id and m.user_id=p.user_id where p.channel_id=c.id and p.user_id=p_user) then
  raise exception 'Choose another family member in this channel' using errcode='22023';end if;
 update app.channel_participants set admin=true where channel_id=c.id and user_id in(p_user,c.manager_id);
 update app.channels set manager_id=p_user,version=version+1,updated_at=clock_timestamp() where id=c.id;
 perform app.queue_channel_refresh(c.id);
end $$;

create function app.leave_channel(p_family uuid,p_channel uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;actor uuid:=app.actor_id();
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Channel not found' using errcode='P0002';end if;
 if c.kind<>'channel' then raise exception 'Direct conversations cannot be left. Archive the chat instead.' using errcode='22023';end if;
 if c.archived_at is null and app.is_channel_admin(c.id,actor) and not exists(select 1 from app.channel_participants p
  where p.channel_id=c.id and p.user_id<>actor and app.is_channel_admin(c.id,p.user_id)) then
  raise exception 'You are the last admin. Make someone else an admin, or archive the channel, before leaving.' using errcode='22023';end if;
 update app.channel_guest_grants set revoked_at=coalesce(revoked_at,clock_timestamp()) where channel_id=c.id and user_id=actor;
 delete from app.channel_participants where channel_id=c.id and user_id=actor;
 update app.channels set version=version+1,updated_at=clock_timestamp() where id=c.id;
end $$;

-- Writing messages. Text may be empty only when files are attached.
create function app.write_message(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid,p_mentions uuid[]) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; existing app.channel_messages; actor uuid:=app.actor_id(); mentions uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Conversation not found' using errcode='P0002'; end if;
 mentions:=array(select distinct u from unnest(coalesce(p_mentions,'{}')) u order by u);
 select * into existing from app.channel_messages where id=p_id;
 if found then
  -- A repeat is recognised even after the saved message was edited or deleted.
  if existing.channel_id=p_channel and existing.author_id=actor and (existing.edited_at is not null or existing.deleted_at is not null
   or (existing.body=btrim(p_body) and existing.reply_to_id is not distinct from p_reply and existing.mentioned_user_ids=mentions)) then return; end if;
  raise exception 'Message ID already in use' using errcode='23505'; end if;
 if c.archived_at is not null then raise exception 'Restore this channel before posting' using errcode='22023'; end if;
 if cardinality(mentions)>100 or exists(select 1 from unnest(mentions) u where u is null or not app.is_channel_participant(c.id,u)) then
  raise exception 'Mention only current conversation members' using errcode='22023'; end if;
 if p_reply is not null and not exists(select 1 from app.channel_messages where id=p_reply and channel_id=p_channel and deleted_at is null) then
  raise exception 'Reply to a message in this conversation' using errcode='22023'; end if;
 update app.channels set last_position=last_position+1 where id=p_channel;
 insert into app.channel_messages(id,channel_id,author_id,position,body,reply_to_id,mentioned_user_ids)
  values(p_id,p_channel,actor,c.last_position+1,btrim(p_body),p_reply,mentions);
 perform app.queue_channel_refresh(p_channel);
 insert into app.outbox(kind,family_id,payload,dedupe_key) values('conversation.notice',p_family,jsonb_build_object('messageId',p_id),'conversation-notice:'||p_id::text);
end $$;
create or replace function app.post_conversation_message(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid,p_mentions uuid[]) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
begin
 if char_length(btrim(coalesce(p_body,'')))=0 then raise exception 'Write a message' using errcode='22023';end if;
 perform app.write_message(p_family,p_channel,p_id,p_body,p_reply,p_mentions);
end $$;
create or replace function app.post_message_with_files(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid,p_mentions uuid[],p_files uuid[]) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare ids uuid[]:=array(select distinct u from unnest(coalesce(p_files,'{}')) u order by u);m app.channel_messages;fid uuid;
begin
 perform 1 from app.families where id=p_family for share;
 perform 1 from app.channels where id=p_channel and family_id=p_family for update;
 if not found or not app.is_channel_participant(p_channel,app.actor_id()) then raise exception 'Conversation not found' using errcode='P0002';end if;
 if cardinality(ids)>5 then raise exception 'Attach up to five files' using errcode='22023';end if;
 if char_length(btrim(coalesce(p_body,'')))=0 and cardinality(ids)=0 then raise exception 'Write a message or attach a file' using errcode='22023';end if;
 select * into m from app.channel_messages where id=p_id;
 if found and m.deleted_at is null and m.original_file_ids is distinct from ids then raise exception 'Message ID already in use for different attachments' using errcode='23505';end if;
 perform app.write_message(p_family,p_channel,p_id,coalesce(p_body,''),p_reply,p_mentions);
 if m.id is null then
  update app.channel_messages set original_file_ids=ids where id=p_id;
  foreach fid in array ids loop perform app.link_message_file(p_family,p_channel,p_id,fid);end loop;
 end if;
end $$;
create function app.mark_forwarded(p_family uuid,p_channel uuid,p_id uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
begin
 update app.channel_messages m set forwarded=true from app.channels c where m.id=p_id and m.channel_id=p_channel and c.id=m.channel_id and c.family_id=p_family
  and m.author_id=app.actor_id() and app.is_channel_participant(c.id,app.actor_id());
end $$;

create function app.edit_message(p_family uuid,p_channel uuid,p_message uuid,p_count integer,p_body text,p_mentions uuid[]) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;m app.channel_messages;actor uuid:=app.actor_id();mentions uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Message not found' using errcode='P0002';end if;
 select * into m from app.channel_messages where id=p_message and channel_id=c.id;
 if m.id is null then raise exception 'Message not found' using errcode='P0002';end if;
 if m.author_id is distinct from actor then raise exception 'Only the author can edit a message' using errcode='42501';end if;
 if m.deleted_at is not null then raise exception 'This message was deleted' using errcode='22023';end if;
 mentions:=array(select distinct u from unnest(coalesce(p_mentions,'{}')) u order by u);
 if m.body=btrim(p_body) and m.mentioned_user_ids=mentions then return;end if;
 if m.edit_count<>p_count then raise exception 'This message was edited elsewhere. Reload before editing.' using errcode='40001';end if;
 if c.archived_at is not null then raise exception 'Restore this channel before editing' using errcode='22023';end if;
 if m.created_at<clock_timestamp()-interval '15 minutes' then raise exception 'Messages can be edited for 15 minutes' using errcode='22023';end if;
 if char_length(btrim(p_body))=0 and not exists(select 1 from app.message_file_links where message_id=m.id) then raise exception 'Write a message' using errcode='22023';end if;
 if cardinality(mentions)>100 or exists(select 1 from unnest(mentions) u where u is null or not(u=any(m.mentioned_user_ids) or app.is_channel_participant(c.id,u))) then
  raise exception 'Mention only current conversation members' using errcode='22023';end if;
 update app.channel_messages set body=btrim(p_body),mentioned_user_ids=mentions,edited_at=clock_timestamp(),edit_count=edit_count+1 where id=m.id;
 delete from app.conversation_alerts where message_id=m.id and kind='mention' and not recipient_id=any(mentions) and c.kind='channel';
 perform app.touch_messages(array(select id from app.channel_messages where id=m.id or reply_to_id=m.id));
 perform app.queue_channel_refresh(c.id);
 -- Newly mentioned people are alerted; everyone already alerted is skipped at delivery.
 if exists(select 1 from unnest(mentions) u where not u=any(m.mentioned_user_ids)) then
  insert into app.outbox(kind,family_id,payload,dedupe_key) values('conversation.notice',p_family,jsonb_build_object('messageId',m.id),'conversation-notice:'||m.id::text||':'||(m.edit_count+1)::text);
 end if;
end $$;

create function app.delete_message(p_family uuid,p_channel uuid,p_message uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;m app.channel_messages;actor uuid:=app.actor_id();files uuid[];
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Message not found' using errcode='P0002';end if;
 select * into m from app.channel_messages where id=p_message and channel_id=c.id;
 if m.id is null then raise exception 'Message not found' using errcode='P0002';end if;
 if m.author_id is distinct from actor then raise exception 'Only the author can delete a message' using errcode='42501';end if;
 if m.deleted_at is not null then return;end if;
 if m.created_at<clock_timestamp()-interval '48 hours' then raise exception 'Messages can be deleted for 48 hours' using errcode='22023';end if;
 files:=array(select file_id from app.message_file_links where message_id=m.id);
 update app.channel_messages set body='',mentioned_user_ids='{}',original_file_ids='{}',deleted_at=clock_timestamp() where id=m.id;
 delete from app.channel_reactions where message_id=m.id;
 delete from app.message_file_links where message_id=m.id;
 delete from app.message_event_links where message_id=m.id;
 delete from app.message_pins where message_id=m.id;
 delete from app.message_stars where message_id=m.id;
 delete from app.conversation_alerts where message_id=m.id;
 -- Files sent straight from the chat go with it, unless another message still shows them.
 update app.stored_files f set archived_at=clock_timestamp(),version=f.version+1 from app.folders d
  where f.id=any(files) and d.id=f.folder_id and d.chat_uploads and f.author_id=actor and f.archived_at is null
  and not exists(select 1 from app.message_file_links l where l.file_id=f.id);
 perform app.touch_messages(array(select id from app.channel_messages where id=m.id or reply_to_id=m.id));
 perform app.queue_channel_refresh(c.id);
end $$;

create function app.refuse_deleted_message() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from app.channel_messages where id=new.message_id and deleted_at is not null) then raise exception 'This message was deleted' using errcode='22023';end if;
 return new;
end $$;
create trigger refuse_deleted_reaction before insert on app.channel_reactions for each row execute function app.refuse_deleted_message();
create trigger refuse_deleted_event_link before insert on app.message_event_links for each row execute function app.refuse_deleted_message();
create trigger refuse_deleted_file_link before insert on app.message_file_links for each row execute function app.refuse_deleted_message();
create function app.refuse_deleted_source() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from app.channel_messages where id=new.source_message_id and deleted_at is not null) then raise exception 'This message was deleted' using errcode='22023';end if;
 return new;
end $$;
create trigger refuse_deleted_source before insert on app.tasks for each row when(new.source_message_id is not null) execute function app.refuse_deleted_source();

-- Alerts read the message after taking the channel lock, so a deleted message is never announced.
create or replace function app.deliver_conversation_notice(p_message uuid) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare m app.channel_messages; c app.channels;
begin
 select * into m from app.channel_messages where id=p_message; if not found then return; end if;
 select * into c from app.channels where id=m.channel_id;
 perform 1 from app.families where id=c.family_id for share;
 select * into c from app.channels where id=m.channel_id for update;
 select * into m from app.channel_messages where id=p_message;
 if c.id is null or c.archived_at is not null or m.id is null or m.deleted_at is not null then return; end if;
 insert into app.conversation_alerts(family_id,message_id,recipient_id,kind,read_at)
  select c.family_id,m.id,p.user_id,case when p.user_id=any(m.mentioned_user_ids) then 'mention' else 'message' end,
   case when p.last_read>=m.position then clock_timestamp() end
  from app.channel_participants p where p.channel_id=c.id and not p.muted and p.user_id is distinct from m.author_id
  and app.is_channel_participant(c.id,p.user_id) and (c.kind='dm' or p.user_id=any(m.mentioned_user_ids))
  on conflict(message_id,recipient_id) do nothing;
 if found then perform app.queue_channel_refresh(c.id); end if;
end $$;

-- One reaction per person.
create or replace function app.react_channel_message(p_family uuid,p_channel uuid,p_message uuid,p_emoji text,p_active boolean) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels; changed integer:=0; n integer;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Channel not found' using errcode='P0002'; end if;
 if c.archived_at is not null then raise exception 'Restore this channel before reacting' using errcode='22023'; end if;
 if not exists(select 1 from app.channel_messages where id=p_message and channel_id=p_channel) then raise exception 'Message not found' using errcode='P0002'; end if;
 if p_active then
  delete from app.channel_reactions where message_id=p_message and user_id=app.actor_id() and emoji<>p_emoji;
  get diagnostics changed=row_count;
  insert into app.channel_reactions(message_id,user_id,emoji) values(p_message,app.actor_id(),p_emoji) on conflict do nothing;
 else delete from app.channel_reactions where message_id=p_message and user_id=app.actor_id() and emoji=p_emoji; end if;
 get diagnostics n=row_count;
 if changed+n>0 then perform app.queue_channel_refresh(p_channel); end if;
end $$;

create table app.message_pins(
 message_id uuid primary key references app.channel_messages(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default clock_timestamp()
);
alter table app.message_pins enable row level security;
grant select on app.message_pins to famsync_api;
create policy message_pins_read on app.message_pins for select to famsync_api using(exists(select 1 from app.channel_messages m where m.id=message_id));
create table app.message_stars(
 user_id uuid not null references auth.users(id) on delete cascade,message_id uuid not null references app.channel_messages(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),primary key(user_id,message_id)
);
create index message_stars_by_message on app.message_stars(message_id);
alter table app.message_stars enable row level security;
grant select on app.message_stars to famsync_api;
create policy message_stars_self on app.message_stars for select to famsync_api using(user_id=app.actor_id());

create function app.pin_message(p_family uuid,p_channel uuid,p_message uuid,p_pinned boolean) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) or not exists(select 1 from app.channel_messages where id=p_message and channel_id=c.id) then raise exception 'Message not found' using errcode='P0002';end if;
 if not exists(select 1 from app.family_memberships where family_id=p_family and user_id=app.actor_id()) then raise exception 'Only family members can pin messages' using errcode='42501';end if;
 if c.archived_at is not null then raise exception 'Restore this channel before pinning' using errcode='22023';end if;
 if p_pinned then
  if exists(select 1 from app.message_pins where message_id=p_message) then return;end if;
  if exists(select 1 from app.channel_messages where id=p_message and deleted_at is not null) then raise exception 'This message was deleted' using errcode='22023';end if;
  if (select count(*) from app.message_pins p join app.channel_messages m on m.id=p.message_id where m.channel_id=c.id)>=3 then raise exception 'Up to three messages can be pinned. Unpin one first.' using errcode='22023';end if;
  insert into app.message_pins(message_id,user_id) values(p_message,app.actor_id());
 else
  delete from app.message_pins where message_id=p_message;
  if not found then return;end if;
 end if;
 perform app.touch_messages(array[p_message]);
 perform app.queue_channel_refresh(c.id);
end $$;
create function app.star_message(p_family uuid,p_channel uuid,p_message uuid,p_starred boolean) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from app.channels where id=p_channel and family_id=p_family for share;
 if not found or not app.is_channel_participant(p_channel,app.actor_id()) or not exists(select 1 from app.channel_messages where id=p_message and channel_id=p_channel) then raise exception 'Message not found' using errcode='P0002';end if;
 if p_starred then
  if exists(select 1 from app.channel_messages where id=p_message and deleted_at is not null) then raise exception 'This message was deleted' using errcode='22023';end if;
  insert into app.message_stars(user_id,message_id) values(app.actor_id(),p_message) on conflict do nothing;
 else delete from app.message_stars where user_id=app.actor_id() and message_id=p_message;end if;
end $$;

-- Personal list preferences. Null leaves a preference as it is.
create function app.set_conversation_preferences(p_family uuid,p_channel uuid,p_pinned boolean,p_hidden boolean,p_unread boolean) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from app.families where id=p_family for share;
 perform 1 from app.channels where id=p_channel and family_id=p_family for share;
 if not found or not app.is_channel_participant(p_channel,app.actor_id()) then raise exception 'Conversation not found' using errcode='P0002';end if;
 update app.channel_participants set
  pinned_at=case when p_pinned is null then pinned_at when p_pinned then coalesce(pinned_at,clock_timestamp()) end,
  hidden_at=case when p_hidden is null then hidden_at when p_hidden then coalesce(hidden_at,clock_timestamp()) end,
  marked_unread=coalesce(p_unread,marked_unread) where channel_id=p_channel and user_id=app.actor_id();
 if p_hidden then update app.channel_participants set pinned_at=null where channel_id=p_channel and user_id=app.actor_id();end if;
end $$;

-- The folder a file sent straight from the chat goes into, created when first needed.
create function app.chat_upload_folder(p_family uuid,p_channel uuid,p_file uuid) returns table(id uuid,version integer)
 language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;d app.folders;n integer;
begin
 perform 1 from app.families where families.id=p_family for share;
 select * into c from app.channels where channels.id=p_channel and channels.family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Conversation not found' using errcode='P0002';end if;
 if c.archived_at is not null then raise exception 'Restore this channel before uploading' using errcode='22023';end if;
 -- A repeated upload keeps its first folder.
 select fd.* into d from app.stored_files f join app.folders fd on fd.id=f.folder_id where f.id=p_file and f.author_id=app.actor_id() and fd.channel_id=c.id and fd.chat_uploads;
 if d.id is null then
  select fd.* into d from app.folders fd where fd.channel_id=c.id and fd.chat_uploads and fd.archived_at is null
   and (select count(*) from app.stored_files f where f.folder_id=fd.id and f.archived_at is null and (f.state='ready' or f.state='uploading' and f.expires_at>clock_timestamp()))<100
   order by fd.created_at,fd.id limit 1;
 end if;
 if d.id is null then
  select count(*) into n from app.folders fd where fd.channel_id=c.id and fd.chat_uploads;
  insert into app.folders(id,family_id,channel_id,author_id,name,audience,chat_uploads)
   values(gen_random_uuid(),p_family,c.id,null,'Chat files'||case when n>0 then ' '||(n+1)::text else '' end,'family',true) returning * into d;
 end if;
 return query select d.id,d.version;
end $$;

-- Opening a conversation also clears a personal unread mark.
create function app.clear_unread_mark() returns trigger language plpgsql set search_path=pg_catalog as $$
begin new.marked_unread:=false;return new;end $$;
create trigger clear_unread_mark before update of last_read on app.channel_participants for each row when(new.last_read>old.last_read) execute function app.clear_unread_mark();

do $$ declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace='app'::regnamespace and p.proname=any(array['set_channel_admin','hand_over_channel','leave_channel','write_message','mark_forwarded',
  'edit_message','delete_message','refuse_deleted_message','refuse_deleted_source','pin_message','star_message','set_conversation_preferences','chat_upload_folder','clear_unread_mark']) loop
  execute format('revoke all on function %s from public',fn);
 end loop;
end $$;
grant execute on function app.set_channel_admin(uuid,uuid,integer,uuid,boolean),app.hand_over_channel(uuid,uuid,integer,uuid),app.leave_channel(uuid,uuid),app.mark_forwarded(uuid,uuid,uuid),
 app.edit_message(uuid,uuid,uuid,integer,text,uuid[]),app.delete_message(uuid,uuid,uuid),app.pin_message(uuid,uuid,uuid,boolean),app.star_message(uuid,uuid,uuid,boolean),
 app.set_conversation_preferences(uuid,uuid,boolean,boolean,boolean),app.chat_upload_folder(uuid,uuid,uuid) to famsync_api;
