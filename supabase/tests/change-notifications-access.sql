-- Who hears about a moved or cancelled occurrence. Everything rolls back.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('a4000000-0000-4000-8000-000000000001', 'change-owner@example.test', now()),
  ('a4000000-0000-4000-8000-000000000002', 'change-member@example.test', now()),
  ('a4000000-0000-4000-8000-000000000003', 'change-other@example.test', now()),
  ('a4000000-0000-4000-8000-000000000004', 'change-outsider@example.test', now());
insert into app.families (id, name, time_zone) values
  ('f4000000-0000-4000-8000-000000000001', 'Change family', 'UTC'),
  ('f4000000-0000-4000-8000-000000000002', 'Other family', 'UTC');
insert into app.family_memberships (family_id, user_id, role) values
  ('f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'owner'),
  ('f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'member'),
  ('f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000003', 'member'),
  ('f4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000004', 'owner');
insert into app.calendar_events (id, family_id, author_id, title, audience, start_date, end_date, remind_minutes, remind_audience) values
  ('e4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
   'Everyone reminded', 'family', '2026-11-20', '2026-11-21', 60, 'everyone'),
  ('e4000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
   'Author reminded', 'family', '2026-11-20', '2026-11-21', 60, 'me'),
  ('e4000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
   'No reminder', 'family', '2026-11-20', '2026-11-21', null, 'me');
insert into app.tasks (id, family_id, author_id, title, audience, assignee_id, event_id) values
  ('b4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
   'Open linked task', 'family', 'a4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000002'),
  ('b4000000-0000-4000-8000-000000000002', 'f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
   'Done linked task', 'family', 'a4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000003');
update app.tasks set status = 'completed' where id = 'b4000000-0000-4000-8000-000000000002';

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
grant execute on function pg_temp.expect(boolean, text), pg_temp.denied(text, text) to famsync_api, famsync_jobs;

set local role famsync_jobs;
select pg_temp.expect((select count(*) = 3 from app.occurrence_change_recipients('e4000000-0000-4000-8000-000000000001', '2026-11-20')),
  'an everyone reminder reaches every member');
select pg_temp.expect((select array_agg(r order by r) = array['a4000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000002']::uuid[]
  from app.occurrence_change_recipients('e4000000-0000-4000-8000-000000000002', '2026-11-20') r),
  'an author reminder reaches the author, plus the assignee of an open linked task');
select pg_temp.expect((select count(*) = 0 from app.occurrence_change_recipients('e4000000-0000-4000-8000-000000000003', '2026-11-20')),
  'no reminder and only a completed linked task reaches no one');
select pg_temp.expect((select not exists (
  select 1 from app.occurrence_change_recipients('e4000000-0000-4000-8000-000000000001', '2026-11-20') r
  where r = 'a4000000-0000-4000-8000-000000000004')), 'another family never hears about the change');
reset role;

set local role famsync_api;
select set_config('app.actor_id', 'a4000000-0000-4000-8000-000000000001', true);
select pg_temp.denied($$select * from app.occurrence_change_recipients('e4000000-0000-4000-8000-000000000001', '2026-11-20')$$,
  'the API role listing change recipients');
reset role;

do $$
begin
  insert into app.notifications (family_id, recipient_id, kind, source_kind, source_id, notification_key)
    values ('f4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'shouted', 'task',
      'b4000000-0000-4000-8000-000000000001', 'bad-kind');
  raise exception 'FAILED: an unknown notification kind was accepted';
exception when check_violation then null;
end
$$;

select 'Change notification checks passed' as result;
rollback;
