-- "Ask everyone" follow-ups: a reminder before the deadline naming who has not answered, and cancelling a collection.
alter table app.helper_collections add column reminded_at timestamptz;

-- Same as before, plus a reminder 30 minutes before the deadline when the collection runs longer than 45 minutes.
create or replace function app.start_helper_collection(p_family uuid, p_channel uuid, p_question text, p_closes_at timestamptz) returns uuid
  language plpgsql security definer set search_path = pg_catalog as $$
declare c app.channels; saved uuid; closes timestamptz;
begin
  perform 1 from app.families where id = p_family for share;
  select * into c from app.channels where id = p_channel and family_id = p_family for update;
  if c.id is null or not app.is_channel_participant(c.id, app.actor_id()) then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  if not c.helper_enabled then raise exception 'Add the Family Helper to this conversation first' using errcode = '22023'; end if;
  if c.archived_at is not null then raise exception 'Restore this conversation first' using errcode = '22023'; end if;
  if exists (select 1 from app.helper_collections where channel_id = p_channel and status in ('open', 'closing')) then
    raise exception 'The helper is already collecting answers in this conversation' using errcode = '22023'; end if;
  closes := least(greatest(p_closes_at, clock_timestamp() + interval '1 minute'), clock_timestamp() + interval '7 days');
  insert into app.helper_collections(family_id, channel_id, question, started_by, after_position, closes_at)
    values (p_family, p_channel, left(btrim(p_question), 500), app.actor_id(), c.last_position, closes)
    returning id into saved;
  insert into app.outbox(kind, family_id, payload, dedupe_key, available_at)
    values ('helper.collection.close', p_family, jsonb_build_object('collectionId', saved), 'helper-collection-close:' || saved::text, closes);
  if closes - clock_timestamp() > interval '45 minutes' then
    insert into app.outbox(kind, family_id, payload, dedupe_key, available_at)
      values ('helper.collection.remind', p_family, jsonb_build_object('collectionId', saved), 'helper-collection-remind:' || saved::text, closes - interval '30 minutes');
  end if;
  perform app.queue_channel_refresh(p_channel);
  return saved;
end $$;

-- Cancelling closes the collection without adding anything or posting a summary.
create function app.cancel_helper_collection(p_family uuid, p_channel uuid) returns uuid
  language plpgsql security definer set search_path = pg_catalog as $$
declare saved uuid;
begin
  if not app.is_channel_participant(p_channel, app.actor_id()) then raise exception 'Conversation not found' using errcode = 'P0002'; end if;
  update app.helper_collections set status = 'closed', closed_at = clock_timestamp()
    where channel_id = p_channel and family_id = p_family and status = 'open' returning id into saved;
  if saved is not null then perform app.queue_channel_refresh(p_channel); end if;
  return saved;
end $$;
revoke all on function app.cancel_helper_collection(uuid, uuid) from public;
grant execute on function app.cancel_helper_collection(uuid, uuid) to famsync_api;

-- The job worker claims a reminder once, while the collection is still open, and learns only who started it.
create function app.claim_helper_collection_reminder(p_id uuid)
  returns table (family_id uuid, channel_id uuid, started_by uuid)
  language sql security definer set search_path = pg_catalog as $$
  update app.helper_collections set reminded_at = clock_timestamp()
    where id = p_id and status = 'open' and reminded_at is null and closes_at > clock_timestamp()
    returning family_id, channel_id, started_by
$$;
revoke all on function app.claim_helper_collection_reminder(uuid) from public;
grant execute on function app.claim_helper_collection_reminder(uuid) to famsync_jobs;

-- Helper replies in conversations are queued so a restart cannot lose them. The job carries only ids;
-- the reply is written as the member who asked.
create function app.queue_helper_reply(p_family uuid, p_channel uuid, p_message uuid) returns void
  language plpgsql security definer set search_path = pg_catalog as $$
begin
  if not exists (select 1 from app.channel_messages m join app.channels c on c.id = m.channel_id
    where m.id = p_message and m.channel_id = p_channel and c.family_id = p_family and c.helper_enabled
      and m.author_id = app.actor_id()) then
    raise exception 'Message not found' using errcode = 'P0002'; end if;
  insert into app.outbox(kind, family_id, payload, dedupe_key)
    values ('helper.reply', p_family, jsonb_build_object('actorId', app.actor_id(), 'channelId', p_channel, 'messageId', p_message), 'helper-reply:' || p_message::text)
    on conflict (dedupe_key) do nothing;
end $$;
revoke all on function app.queue_helper_reply(uuid, uuid, uuid) from public;
grant execute on function app.queue_helper_reply(uuid, uuid, uuid) to famsync_api;
