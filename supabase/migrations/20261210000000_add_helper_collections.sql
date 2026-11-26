-- "Ask everyone": the Family Helper asks a question in a conversation, collects the replies until a deadline,
-- then adds what people asked for to the shopping list and posts a summary. The replies are simply the
-- conversation's messages after the question, so nothing extra is stored about them.
create table app.helper_collections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references app.families(id) on delete cascade,
  channel_id uuid not null references app.channels(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 500),
  started_by uuid not null references auth.users(id) on delete cascade,
  after_position integer not null,
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closing', 'closed')),
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz
);
-- One open collection per conversation.
create unique index helper_collections_one_open on app.helper_collections(channel_id) where status in ('open', 'closing');
alter table app.helper_collections enable row level security;
grant select on app.helper_collections to famsync_api;
create policy helper_collections_read on app.helper_collections for select to famsync_api using (app.can_access_channel(channel_id));

-- Opens a collection as the member who asked. The close job is queued for the deadline.
create function app.start_helper_collection(p_family uuid, p_channel uuid, p_question text, p_closes_at timestamptz) returns uuid
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; saved uuid;
begin
  perform 1 from app.families where id = p_family for share;
  select * into c from app.channels where id = p_channel and family_id = p_family for update;
  if c.id is null or not app.is_channel_participant(c.id, app.actor_id()) then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  if not c.helper_enabled then raise exception 'Add the Family Helper to this conversation first' using errcode = '22023'; end if;
  if c.archived_at is not null then raise exception 'Restore this conversation first' using errcode = '22023'; end if;
  if exists (select 1 from app.helper_collections where channel_id = p_channel and status in ('open', 'closing')) then
    raise exception 'The helper is already collecting answers in this conversation' using errcode = '22023'; end if;
  insert into app.helper_collections(family_id, channel_id, question, started_by, after_position, closes_at)
    values (p_family, p_channel, left(btrim(p_question), 500), app.actor_id(), c.last_position,
      least(greatest(p_closes_at, clock_timestamp() + interval '1 minute'), clock_timestamp() + interval '7 days'))
    returning id into saved;
  insert into app.outbox(kind, family_id, payload, dedupe_key, available_at)
    values ('helper.collection.close', p_family, jsonb_build_object('collectionId', saved), 'helper-collection-close:' || saved::text,
      (select closes_at from app.helper_collections where id = saved));
  perform app.queue_channel_refresh(p_channel);
  return saved;
end $$;
revoke all on function app.start_helper_collection(uuid, uuid, text, timestamptz) from public;
grant execute on function app.start_helper_collection(uuid, uuid, text, timestamptz) to famsync_api;

-- Closes early ("wrap it up"): queues the close job now. Running it twice is harmless.
create function app.close_helper_collection_now(p_family uuid, p_channel uuid) returns uuid
  language plpgsql security definer set search_path = pg_catalog as $$
declare saved uuid;
begin
  if not app.is_channel_participant(p_channel, app.actor_id()) then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  select id into saved from app.helper_collections where channel_id = p_channel and family_id = p_family and status = 'open';
  if saved is null then return null; end if;
  update app.helper_collections set closes_at = least(closes_at, clock_timestamp()) where id = saved;
  insert into app.outbox(kind, family_id, payload, dedupe_key)
    values ('helper.collection.close', p_family, jsonb_build_object('collectionId', saved), 'helper-collection-close-now:' || saved::text)
    on conflict (dedupe_key) do nothing;
  return saved;
end $$;
revoke all on function app.close_helper_collection_now(uuid, uuid) from public;
grant execute on function app.close_helper_collection_now(uuid, uuid) to famsync_api;

-- The job worker claims a due collection and learns only who started it, never its content.
create function app.claim_helper_collection(p_id uuid)
  returns table (family_id uuid, channel_id uuid, started_by uuid)
  language sql security definer set search_path = pg_catalog as $$
  update app.helper_collections set status = 'closing'
    where id = p_id and status = 'open' and closes_at <= clock_timestamp()
    returning family_id, channel_id, started_by
$$;
revoke all on function app.claim_helper_collection(uuid) from public;
grant execute on function app.claim_helper_collection(uuid) to famsync_jobs;

create function app.finish_helper_collection(p_id uuid, p_done boolean) returns void
  language sql security definer set search_path = pg_catalog as $$
  update app.helper_collections set status = case when p_done then 'closed' else 'open' end,
    closed_at = case when p_done then clock_timestamp() end
    where id = p_id and status = 'closing'
$$;
revoke all on function app.finish_helper_collection(uuid, boolean) from public;
grant execute on function app.finish_helper_collection(uuid, boolean) to famsync_jobs;

-- A refresh tells everyone in the conversation that the collection banner changed.
create function app.queue_helper_collection_refresh(p_id uuid) returns void
  language sql security definer set search_path = pg_catalog as $$
  select app.queue_channel_refresh(channel_id) from app.helper_collections where id = p_id
$$;
revoke all on function app.queue_helper_collection_refresh(uuid) from public;
grant execute on function app.queue_helper_collection_refresh(uuid) to famsync_jobs;
