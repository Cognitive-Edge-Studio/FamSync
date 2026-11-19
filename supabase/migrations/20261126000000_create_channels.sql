create table app.channels (
  id uuid primary key,
  family_id uuid not null references app.families(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  manager_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  emoji text not null default '💬' check (char_length(emoji) between 1 and 16),
  topic text not null default '' check (char_length(topic) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  last_position integer not null default 0 check (last_position >= 0),
  version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, family_id)
);
create index channels_by_family on app.channels(family_id, created_at, id);
create table app.channel_participants (
  channel_id uuid not null,
  family_id uuid not null,
  user_id uuid not null,
  last_read integer not null default 0 check (last_read >= 0),
  joined_at timestamptz not null default clock_timestamp(),
  primary key(channel_id,user_id),
  foreign key(channel_id,family_id) references app.channels(id,family_id) on delete cascade,
  foreign key(family_id,user_id) references app.family_memberships(family_id,user_id) on delete cascade
);
create index channel_participants_by_user on app.channel_participants(user_id,channel_id);
create table app.channel_messages (
  id uuid primary key,
  channel_id uuid not null references app.channels(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  position integer not null check (position > 0),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  reply_to_id uuid references app.channel_messages(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(channel_id,position)
);
create index channel_messages_by_reply on app.channel_messages(reply_to_id,position) where reply_to_id is not null;
create table app.channel_reactions (
  message_id uuid not null references app.channel_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','🎉','😂','🙏')),
  primary key(message_id,user_id,emoji)
);

create function app.is_channel_participant(p_channel uuid,p_user uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from app.channel_participants p join app.family_memberships m
    on m.family_id=p.family_id and m.user_id=p.user_id where p.channel_id=p_channel and p.user_id=p_user)
$$;
revoke all on function app.is_channel_participant(uuid,uuid) from public;
create function app.can_access_channel(p_channel uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog as $$
  select app.is_channel_participant(p_channel, app.actor_id())
$$;
revoke all on function app.can_access_channel(uuid) from public;
grant execute on function app.can_access_channel(uuid) to famsync_api;
alter table app.channels enable row level security;
alter table app.channel_participants enable row level security;
alter table app.channel_messages enable row level security;
alter table app.channel_reactions enable row level security;
grant select on app.channels,app.channel_participants,app.channel_messages,app.channel_reactions to famsync_api;
create policy channels_read on app.channels for select to famsync_api using(app.can_access_channel(id));
create policy channel_participants_read on app.channel_participants for select to famsync_api using(app.can_access_channel(channel_id));
create policy channel_messages_read on app.channel_messages for select to famsync_api using(app.can_access_channel(channel_id));
create policy channel_reactions_read on app.channel_reactions for select to famsync_api
  using(exists(select 1 from app.channel_messages m where m.id=message_id));

create function app.queue_channel_refresh(p_id uuid) returns void
  language sql security definer set search_path = pg_catalog as $$
  insert into app.outbox(kind,family_id,payload,dedupe_key)
    select 'channel.refresh',family_id,jsonb_build_object('channelId',id),'channel:' || gen_random_uuid()::text
    from app.channels where id=p_id
$$;
revoke all on function app.queue_channel_refresh(uuid) from public;

create function app.validate_channel_members(p_family uuid,p_manager uuid,p_members uuid[]) returns void
  language plpgsql set search_path = pg_catalog as $$
begin
  if cardinality(p_members) not between 1 and 100 or not p_manager=any(p_members) or exists
    (select 1 from unnest(p_members) u where u is null or not exists
      (select 1 from app.family_memberships m where m.family_id=p_family and m.user_id=u)) then
    raise exception 'Choose up to 100 current family members and include the channel manager' using errcode='22023';
  end if;
end $$;
revoke all on function app.validate_channel_members(uuid,uuid,uuid[]) from public;

create function app.create_channel(p_family uuid,p_id uuid,p_data jsonb) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; actor uuid:=app.actor_id(); people uuid[];
begin
  perform 1 from app.families where id=p_family for share;
  if not exists(select 1 from app.family_memberships where family_id=p_family and user_id=actor) then
    raise exception 'Family not found' using errcode='P0002'; end if;
  select * into c from app.channels where id=p_id;
  if found then
    if c.family_id=p_family and c.author_id=actor and app.is_channel_participant(c.id,actor) then return; end if;
    raise exception 'Channel ID already in use' using errcode='23505';
  end if;
  people:=array(select distinct jsonb_array_elements_text(p_data->'memberIds')::uuid);
  perform app.validate_channel_members(p_family,actor,people);
  insert into app.channels(id,family_id,author_id,manager_id,name,emoji,topic,description)
    values(p_id,p_family,actor,actor,btrim(p_data->>'name'),p_data->>'emoji',btrim(p_data->>'topic'),btrim(p_data->>'description'));
  insert into app.channel_participants(channel_id,family_id,user_id) select p_id,p_family,unnest(people);
  perform app.queue_channel_refresh(p_id);
end $$;
revoke all on function app.create_channel(uuid,uuid,jsonb) from public;
grant execute on function app.create_channel(uuid,uuid,jsonb) to famsync_api;

create function app.change_channel(p_family uuid,p_id uuid,p_version integer,p_action text,p_data jsonb) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; people uuid[];
begin
  perform 1 from app.families where id=p_family for share;
  select * into c from app.channels where id=p_id and family_id=p_family for update;
  if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Channel not found' using errcode='P0002'; end if;
  if c.manager_id is distinct from app.actor_id() then raise exception 'Only the channel manager can make this change' using errcode='42501'; end if;
  if c.version is distinct from p_version then raise exception 'This channel changed. Reload before saving.' using errcode='40001'; end if;
  if p_action='details' then
    people:=array(select distinct jsonb_array_elements_text(p_data->'memberIds')::uuid);
    perform app.validate_channel_members(p_family,c.manager_id,people);
    update app.channels set name=btrim(p_data->>'name'),emoji=p_data->>'emoji',topic=btrim(p_data->>'topic'),
      description=btrim(p_data->>'description') where id=p_id;
    delete from app.channel_participants where channel_id=p_id and not user_id=any(people);
    insert into app.channel_participants(channel_id,family_id,user_id,last_read)
      select p_id,p_family,unnest(people),c.last_position on conflict do nothing;
  elsif p_action='archive' and p_data->>'archived' is not null then
    update app.channels set archived_at=case when (p_data->>'archived')::boolean then coalesce(archived_at,clock_timestamp()) end where id=p_id;
  else raise exception 'Unknown channel action' using errcode='22023'; end if;
  update app.channels set version=version+1,updated_at=clock_timestamp() where id=p_id;
  perform app.queue_channel_refresh(p_id);
end $$;
revoke all on function app.change_channel(uuid,uuid,integer,text,jsonb) from public;
grant execute on function app.change_channel(uuid,uuid,integer,text,jsonb) to famsync_api;

create function app.post_channel_message(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; existing app.channel_messages; parent app.channel_messages; actor uuid:=app.actor_id();
begin
  perform 1 from app.families where id=p_family for share;
  select * into c from app.channels where id=p_channel and family_id=p_family for update;
  if c.id is null or not app.is_channel_participant(c.id,actor) then raise exception 'Channel not found' using errcode='P0002'; end if;
  select * into existing from app.channel_messages where id=p_id;
  if found then
    if existing.channel_id=p_channel and existing.author_id=actor and existing.body=btrim(p_body) and existing.reply_to_id is not distinct from p_reply then return; end if;
    raise exception 'Message ID already in use' using errcode='23505';
  end if;
  if c.archived_at is not null then raise exception 'Restore this channel before posting' using errcode='22023'; end if;
  if p_reply is not null then
    select * into parent from app.channel_messages where id=p_reply and channel_id=p_channel;
    if parent.id is null or parent.reply_to_id is not null then raise exception 'Reply to an original message in this channel' using errcode='22023'; end if;
  end if;
  update app.channels set last_position=last_position+1 where id=p_channel;
  insert into app.channel_messages(id,channel_id,author_id,position,body,reply_to_id)
    values(p_id,p_channel,actor,c.last_position+1,btrim(p_body),p_reply);
  perform app.queue_channel_refresh(p_channel);
end $$;
revoke all on function app.post_channel_message(uuid,uuid,uuid,text,uuid) from public;
grant execute on function app.post_channel_message(uuid,uuid,uuid,text,uuid) to famsync_api;

create function app.react_channel_message(p_family uuid,p_channel uuid,p_message uuid,p_emoji text,p_active boolean) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; changed integer;
begin
  perform 1 from app.families where id=p_family for share;
  select * into c from app.channels where id=p_channel and family_id=p_family for update;
  if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Channel not found' using errcode='P0002'; end if;
  if c.archived_at is not null then raise exception 'Restore this channel before reacting' using errcode='22023'; end if;
  if not exists(select 1 from app.channel_messages where id=p_message and channel_id=p_channel) then raise exception 'Message not found' using errcode='P0002'; end if;
  if p_active then
    insert into app.channel_reactions(message_id,user_id,emoji) values(p_message,app.actor_id(),p_emoji) on conflict do nothing;
  else delete from app.channel_reactions where message_id=p_message and user_id=app.actor_id() and emoji=p_emoji; end if;
  get diagnostics changed=row_count;
  if changed>0 then perform app.queue_channel_refresh(p_channel); end if;
end $$;
revoke all on function app.react_channel_message(uuid,uuid,uuid,text,boolean) from public;
grant execute on function app.react_channel_message(uuid,uuid,uuid,text,boolean) to famsync_api;

create function app.read_channel(p_family uuid,p_channel uuid,p_position integer) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels;
begin
  perform 1 from app.families where id=p_family for share;
  select * into c from app.channels where id=p_channel and family_id=p_family for share;
  if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Channel not found' using errcode='P0002'; end if;
  if p_position<0 or p_position>c.last_position then raise exception 'Choose a saved message position' using errcode='22023'; end if;
  update app.channel_participants set last_read=p_position where channel_id=p_channel and user_id=app.actor_id() and last_read<p_position;
  if found then perform app.queue_channel_refresh(p_channel); end if;
end $$;
revoke all on function app.read_channel(uuid,uuid,integer) from public;
grant execute on function app.read_channel(uuid,uuid,integer) to famsync_api;

-- Membership cascades remove participation. If the manager leaves the family, the oldest remaining
-- participant takes over; a channel with nobody left is archived and has no manager.
create function app.after_channel_participant_removed() returns trigger
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; successor uuid;
begin
  select * into c from app.channels where id=old.channel_id for update;
  if c.id is null then return old; end if;
  if c.manager_id=old.user_id or c.manager_id is null then
    select p.user_id into successor from app.channel_participants p join app.family_memberships m
      on m.family_id=p.family_id and m.user_id=p.user_id where p.channel_id=c.id order by p.joined_at,p.user_id limit 1;
    update app.channels set manager_id=successor,version=version+1,updated_at=clock_timestamp(),
      archived_at=case when successor is null then coalesce(archived_at,clock_timestamp()) else archived_at end where id=c.id;
  end if;
  perform app.queue_channel_refresh(c.id);
  return old;
end $$;
revoke all on function app.after_channel_participant_removed() from public;
create trigger after_channel_participant_removed after delete on app.channel_participants
  for each row execute function app.after_channel_participant_removed();

-- The jobs role receives topic recipients only, never channel names or message bodies.
create function app.channel_signal_recipients(p_channel uuid) returns table(user_id uuid)
  language sql stable security definer set search_path = pg_catalog as $$
  select p.user_id from app.channel_participants p join app.family_memberships m
    on m.family_id=p.family_id and m.user_id=p.user_id where p.channel_id=p_channel
$$;
revoke all on function app.channel_signal_recipients(uuid) from public;
grant execute on function app.channel_signal_recipients(uuid) to famsync_jobs;

-- Recipient-specific topics also stop publishing to a removed user's already-open socket.
create function app.can_receive_channel_signal(p_topic text) returns boolean
  language plpgsql stable security definer set search_path = pg_catalog as $$
declare parts text[]:=string_to_array(p_topic,':'); viewer uuid:=auth.uid();
begin
  if array_length(parts,1)<>4 or parts[1]<>'famsync' or parts[2]<>'channel' or viewer is null or parts[4]<>viewer::text
    or parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return app.is_channel_participant(parts[3]::uuid,viewer);
end $$;
revoke all on function app.can_receive_channel_signal(text) from public;
grant usage on schema app to authenticated;
grant execute on function app.can_receive_channel_signal(text) to authenticated;
