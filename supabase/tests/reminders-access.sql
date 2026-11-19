-- Reminder, notification, and preference boundaries. Everything rolls back.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('a3000000-0000-4000-8000-000000000001', 'remind-owner@example.test', now()),
  ('a3000000-0000-4000-8000-000000000002', 'remind-member@example.test', now()),
  ('a3000000-0000-4000-8000-000000000003', 'remind-other@example.test', now()),
  ('a3000000-0000-4000-8000-000000000004', 'remind-outsider@example.test', now());
insert into app.families (id, name, time_zone) values ('f3000000-0000-4000-8000-000000000001', 'Reminder family', 'UTC');
insert into app.family_memberships (family_id, user_id, role) values
  ('f3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'owner'),
  ('f3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'member'),
  ('f3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'member');

create function pg_temp.act(p_user text) returns void language sql
  as $$ select set_config('app.actor_id', p_user, true) $$;
create function pg_temp.expect(p_ok boolean, p_label text) returns void language plpgsql
  as $$ begin if not p_ok then raise exception 'FAILED: %', p_label; end if; end $$;
create function pg_temp.denied(p_sql text, p_label text) returns void language plpgsql
  as $$
begin
  execute p_sql;
  raise exception 'FAILED: % was allowed', p_label;
exception when insufficient_privilege then null;
end
$$;
grant execute on function pg_temp.act(text), pg_temp.expect(boolean, text), pg_temp.denied(text, text) to famsync_api, famsync_jobs;

-- The jobs role plans reminders and writes notifications. A repeated plan reuses the same row.
set local role famsync_jobs;
insert into app.reminders (id, family_id, source_kind, source_id, recipient_id, author_id, remind_at, due_at) values
  ('c3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'task',
   'b3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001',
   '2026-11-20T12:00:00Z', '2026-11-20T13:00:00Z');
insert into app.reminders (family_id, source_kind, source_id, recipient_id, author_id, remind_at, due_at) values
  ('f3000000-0000-4000-8000-000000000001', 'task', 'b3000000-0000-4000-8000-000000000001',
   'a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', '2026-11-20T12:00:00Z', '2026-11-20T13:00:00Z')
  on conflict (source_kind, source_id, occurrence_key, recipient_id, remind_at) do nothing;
select pg_temp.expect((select count(*) = 1 from app.reminders where source_id = 'b3000000-0000-4000-8000-000000000001'),
  'a repeated plan keeps one reminder');
insert into app.notifications (family_id, recipient_id, kind, source_kind, source_id, due_at, notification_key) values
  ('f3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'reminder', 'task',
   'b3000000-0000-4000-8000-000000000001', '2026-11-20T13:00:00Z', 'reminder:c3000000-0000-4000-8000-000000000001');
insert into app.notifications (family_id, recipient_id, kind, source_kind, source_id, due_at, notification_key) values
  ('f3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'reminder', 'task',
   'b3000000-0000-4000-8000-000000000001', '2026-11-20T13:00:00Z', 'reminder:c3000000-0000-4000-8000-000000000001')
  on conflict (notification_key) do nothing;
select pg_temp.expect((select count(*) = 1 from app.notifications where source_id = 'b3000000-0000-4000-8000-000000000001'),
  'a repeated delivery keeps one notification');
insert into app.outbox (kind, family_id, payload, dedupe_key, available_at)
  values ('notification.email', 'f3000000-0000-4000-8000-000000000001', '{}', 'email:reminder-check', now() + interval '1 hour');
select count(*) from app.reminder_sources();
select pg_temp.denied($$select count(*) from app.notification_preferences$$, 'the jobs role reading preferences');
reset role;

-- The API role cannot see or change planned reminders or list reminder sources.
set local role famsync_api;
select pg_temp.act('a3000000-0000-4000-8000-000000000002');
select pg_temp.denied($$select count(*) from app.reminders$$, 'the API role reading reminders');
select pg_temp.denied($$select * from app.reminder_sources()$$, 'the API role listing reminder sources');
select pg_temp.denied($$insert into app.notifications (family_id, recipient_id, kind, source_kind, source_id, due_at, notification_key)
  values ('f3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'reminder', 'task',
  gen_random_uuid(), now(), 'forged')$$, 'the API role creating notifications');

-- Recipients see and mark only their own notifications.
select pg_temp.expect((select count(*) = 1 from app.notifications), 'the recipient sees their notification');
update app.notifications set read_at = now();
select pg_temp.expect((select read_at is not null from app.notifications), 'the recipient marks it read');
select pg_temp.denied($$update app.notifications set notification_key = 'changed'$$, 'the recipient changing other fields');
select pg_temp.act('a3000000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) = 0 from app.notifications), 'another member sees no one else''s notifications');
update app.notifications set read_at = null;
reset role;
select pg_temp.expect((select read_at is not null from app.notifications where source_id = 'b3000000-0000-4000-8000-000000000001'),
  'another member cannot change someone else''s notification');

-- Preferences are private to each person.
set local role famsync_api;
select pg_temp.act('a3000000-0000-4000-8000-000000000002');
insert into app.notification_preferences (user_id, email_reminders) values ('a3000000-0000-4000-8000-000000000002', false);
select pg_temp.denied($$insert into app.notification_preferences (user_id) values ('a3000000-0000-4000-8000-000000000003')$$,
  'saving someone else''s preferences');
select pg_temp.act('a3000000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) = 0 from app.notification_preferences), 'another member cannot read preferences');

-- Event reminder recipients follow the audience, and only members can ask.
select pg_temp.act('a3000000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) = 3 from app.family_item_viewers('f3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', 'family', '{}')), 'a family event reaches every member');
select pg_temp.expect((select array_agg(v order by v) = array['a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002']::uuid[] from app.family_item_viewers('f3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', 'selected', '{a3000000-0000-4000-8000-000000000002}') v),
  'a selected event reaches the author and selected members');
select pg_temp.expect((select count(*) = 1 from app.family_item_viewers('f3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', 'private', '{}')), 'a private event reaches only its author');
select pg_temp.act('a3000000-0000-4000-8000-000000000004');
select pg_temp.expect((select count(*) = 0 from app.family_item_viewers('f3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001', 'family', '{}')), 'an outsider gets no recipients');
reset role;

select 'Reminder access checks passed' as result;
rollback;
