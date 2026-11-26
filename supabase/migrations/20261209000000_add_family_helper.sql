-- Family Helper: an AI member of the family that can be added to conversations, keeps a shared shopping list
-- and remembers short facts. The helper has no account of its own: its messages have no author and are marked from_helper.
-- Everything is read and written as the member who asked, through the functions below.

create function app.is_helper_member(p_family uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from app.family_memberships where family_id = p_family and user_id = app.actor_id())
$$;
revoke all on function app.is_helper_member(uuid) from public;
grant execute on function app.is_helper_member(uuid) to famsync_api;

create table app.family_helpers (
  family_id uuid primary key references app.families(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  emoji text not null default '🌿' check (char_length(emoji) between 1 and 16),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app.channels add column helper_enabled boolean not null default false;
alter table app.channel_messages add column from_helper boolean not null default false;

-- One shared shopping list per family for now.
create table app.helper_list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app.families(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  requested_by uuid references auth.users(id) on delete set null,
  added_by uuid references auth.users(id) on delete set null,
  added_by_helper boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index helper_list_items_by_family on app.helper_list_items(family_id, done_at, created_at);

-- Short facts the helper keeps, optionally about one member. These form its long-term memory.
create table app.helper_facts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app.families(id) on delete cascade,
  about_user uuid references auth.users(id) on delete set null,
  fact text not null check (char_length(btrim(fact)) between 1 and 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create index helper_facts_by_family on app.helper_facts(family_id, created_at);

-- A rolling summary per conversation, so the helper never has to read the whole history.
create table app.helper_channel_summaries (
  channel_id uuid primary key references app.channels(id) on delete cascade,
  family_id uuid not null references app.families(id) on delete cascade,
  summary text not null check (char_length(summary) <= 4000),
  through_position integer not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);

alter table app.family_helpers enable row level security;
alter table app.helper_list_items enable row level security;
alter table app.helper_facts enable row level security;
alter table app.helper_channel_summaries enable row level security;
grant select on app.family_helpers, app.helper_list_items, app.helper_facts to famsync_api;
create policy family_helpers_read on app.family_helpers for select to famsync_api using (app.is_helper_member(family_id));
create policy helper_list_items_read on app.helper_list_items for select to famsync_api using (app.is_helper_member(family_id));
create policy helper_facts_read on app.helper_facts for select to famsync_api using (app.is_helper_member(family_id));
grant select on app.helper_channel_summaries to famsync_api;
create policy helper_channel_summaries_read on app.helper_channel_summaries for select to famsync_api using (app.can_access_channel(channel_id));

create function app.save_family_helper(p_family uuid, p_name text, p_emoji text) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not app.is_helper_member(p_family) then raise exception 'Family not found' using errcode = 'P0002'; end if;
  insert into app.family_helpers(family_id, name, emoji, created_by) values (p_family, btrim(p_name), coalesce(nullif(btrim(p_emoji), ''), '🌿'), app.actor_id())
    on conflict (family_id) do update set name = excluded.name, emoji = excluded.emoji, updated_at = clock_timestamp();
end $$;
revoke all on function app.save_family_helper(uuid, text, text) from public;
grant execute on function app.save_family_helper(uuid, text, text) to famsync_api;

create function app.set_channel_helper(p_family uuid, p_channel uuid, p_enabled boolean) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not app.is_helper_member(p_family) or not app.is_channel_participant(p_channel, app.actor_id()) then
    raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  if p_enabled and not exists(select 1 from app.family_helpers where family_id = p_family) then
    raise exception 'Add a Family Helper first' using errcode = '22023'; end if;
  update app.channels set helper_enabled = p_enabled where id = p_channel and family_id = p_family;
  perform app.queue_channel_refresh(p_channel);
end $$;
revoke all on function app.set_channel_helper(uuid, uuid, boolean) from public;
grant execute on function app.set_channel_helper(uuid, uuid, boolean) to famsync_api;

-- Posts the helper's reply on behalf of the member who asked. It mentions them so they are alerted.
create function app.post_helper_message(p_family uuid, p_channel uuid, p_id uuid, p_body text, p_reply uuid) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; actor uuid := app.actor_id();
begin
  perform 1 from app.families where id = p_family for share;
  select * into c from app.channels where id = p_channel and family_id = p_family for update;
  if c.id is null or not app.is_channel_participant(c.id, actor) then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  if not c.helper_enabled then raise exception 'The Family Helper is not in this conversation' using errcode = '22023'; end if;
  if c.archived_at is not null then return; end if;
  if exists(select 1 from app.channel_messages where id = p_id) then return; end if;
  update app.channels set last_position = last_position + 1 where id = p_channel;
  insert into app.channel_messages(id, channel_id, author_id, position, body, reply_to_id, mentioned_user_ids, from_helper)
    values (p_id, p_channel, null, c.last_position + 1, left(btrim(p_body), 4000),
      (select id from app.channel_messages where id = p_reply and channel_id = p_channel and deleted_at is null), array[actor], true);
  perform app.queue_channel_refresh(p_channel);
  insert into app.outbox(kind, family_id, payload, dedupe_key)
    values ('conversation.notice', p_family, jsonb_build_object('messageId', p_id), 'conversation-notice:' || p_id::text);
end $$;
revoke all on function app.post_helper_message(uuid, uuid, uuid, text, uuid) from public;
grant execute on function app.post_helper_message(uuid, uuid, uuid, text, uuid) to famsync_api;

create function app.add_helper_list_item(p_family uuid, p_title text, p_requested_by uuid, p_by_helper boolean) returns uuid
  language plpgsql security definer set search_path = pg_catalog as $$
declare saved uuid;
begin
  if not app.is_helper_member(p_family) then raise exception 'Family not found' using errcode = 'P0002'; end if;
  -- An item already open on the list is not added twice.
  select id into saved from app.helper_list_items where family_id = p_family and done_at is null and lower(btrim(title)) = lower(btrim(p_title)) limit 1;
  if saved is not null then return saved; end if;
  insert into app.helper_list_items(family_id, title, requested_by, added_by, added_by_helper)
    values (p_family, btrim(p_title),
      (select user_id from app.family_memberships where family_id = p_family and user_id = p_requested_by), app.actor_id(), coalesce(p_by_helper, false))
    returning id into saved;
  return saved;
end $$;
revoke all on function app.add_helper_list_item(uuid, text, uuid, boolean) from public;
grant execute on function app.add_helper_list_item(uuid, text, uuid, boolean) to famsync_api;

create function app.set_helper_list_item_done(p_family uuid, p_item uuid, p_done boolean) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not app.is_helper_member(p_family) then raise exception 'Family not found' using errcode = 'P0002'; end if;
  update app.helper_list_items set done_at = case when p_done then coalesce(done_at, clock_timestamp()) end where id = p_item and family_id = p_family;
  if not found then raise exception 'Item not found' using errcode = 'P0002'; end if;
end $$;
revoke all on function app.set_helper_list_item_done(uuid, uuid, boolean) from public;
grant execute on function app.set_helper_list_item_done(uuid, uuid, boolean) to famsync_api;

create function app.remove_helper_list_item(p_family uuid, p_item uuid) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not app.is_helper_member(p_family) then raise exception 'Family not found' using errcode = 'P0002'; end if;
  delete from app.helper_list_items where id = p_item and family_id = p_family;
end $$;
revoke all on function app.remove_helper_list_item(uuid, uuid) from public;
grant execute on function app.remove_helper_list_item(uuid, uuid) to famsync_api;

create function app.clear_done_helper_list_items(p_family uuid) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not app.is_helper_member(p_family) then raise exception 'Family not found' using errcode = 'P0002'; end if;
  delete from app.helper_list_items where family_id = p_family and done_at is not null;
end $$;
revoke all on function app.clear_done_helper_list_items(uuid) from public;
grant execute on function app.clear_done_helper_list_items(uuid) to famsync_api;

create function app.add_helper_fact(p_family uuid, p_fact text, p_about uuid) returns uuid
  language plpgsql security definer set search_path = pg_catalog as $$
declare saved uuid;
begin
  if not app.is_helper_member(p_family) then raise exception 'Family not found' using errcode = 'P0002'; end if;
  select id into saved from app.helper_facts where family_id = p_family and lower(btrim(fact)) = lower(btrim(p_fact)) limit 1;
  if saved is not null then return saved; end if;
  -- Memory stays small: the oldest facts make room once a family has 200.
  delete from app.helper_facts where id in (select id from app.helper_facts where family_id = p_family order by created_at desc offset 199);
  insert into app.helper_facts(family_id, fact, about_user, created_by)
    values (p_family, btrim(p_fact), (select user_id from app.family_memberships where family_id = p_family and user_id = p_about), app.actor_id())
    returning id into saved;
  return saved;
end $$;
revoke all on function app.add_helper_fact(uuid, text, uuid) from public;
grant execute on function app.add_helper_fact(uuid, text, uuid) to famsync_api;

create function app.forget_helper_fact(p_family uuid, p_fact uuid) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not app.is_helper_member(p_family) then raise exception 'Family not found' using errcode = 'P0002'; end if;
  delete from app.helper_facts where id = p_fact and family_id = p_family;
end $$;
revoke all on function app.forget_helper_fact(uuid, uuid) from public;
grant execute on function app.forget_helper_fact(uuid, uuid) to famsync_api;

create function app.save_helper_channel_summary(p_family uuid, p_channel uuid, p_summary text, p_through integer) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not app.is_channel_participant(p_channel, app.actor_id()) or not exists(select 1 from app.channels where id = p_channel and family_id = p_family) then
    raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  insert into app.helper_channel_summaries(channel_id, family_id, summary, through_position) values (p_channel, p_family, left(p_summary, 4000), p_through)
    on conflict (channel_id) do update set summary = excluded.summary, through_position = excluded.through_position, updated_at = clock_timestamp()
    where app.helper_channel_summaries.through_position < excluded.through_position;
end $$;
revoke all on function app.save_helper_channel_summary(uuid, uuid, text, integer) from public;
grant execute on function app.save_helper_channel_summary(uuid, uuid, text, integer) to famsync_api;
