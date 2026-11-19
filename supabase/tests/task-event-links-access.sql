-- Task to event link checks against the restricted API role. Everything rolls back.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('a1000000-0000-4000-8000-000000000001', 'links-owner@example.test', now()),
  ('a1000000-0000-4000-8000-000000000002', 'links-member@example.test', now()),
  ('a1000000-0000-4000-8000-000000000003', 'links-outsider@example.test', now());
insert into app.families (id, name, time_zone) values
  ('f1000000-0000-4000-8000-000000000001', 'Link family', 'UTC'),
  ('f1000000-0000-4000-8000-000000000002', 'Other family', 'UTC');
insert into app.family_memberships (family_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'member'),
  ('f1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003', 'owner');
insert into app.calendar_events (id, family_id, author_id, title, audience, start_date, end_date) values
  ('e1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Family practice', 'family', '2026-11-20', '2026-11-21'),
  ('e1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
   'Member private appointment', 'private', '2026-11-20', '2026-11-21'),
  ('e1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003',
   'Other family event', 'family', '2026-11-20', '2026-11-21');

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
grant execute on function pg_temp.act(text), pg_temp.expect(boolean, text), pg_temp.denied(text, text) to famsync_api;

set local role famsync_api;

select pg_temp.act('a1000000-0000-4000-8000-000000000001');
insert into app.tasks (id, family_id, author_id, title, audience, assignee_id, due_date, event_id) values
  ('b1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Pack kit', 'family', 'a1000000-0000-4000-8000-000000000002', '2026-11-20', 'e1000000-0000-4000-8000-000000000001');
select pg_temp.denied($$insert into app.tasks (id, family_id, author_id, title, audience, event_id) values
  ('b1000000-0000-4000-8000-000000000009', 'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Cross-family link', 'family', 'e1000000-0000-4000-8000-000000000003')$$, 'linking another family''s event');
select pg_temp.denied($$insert into app.tasks (id, family_id, author_id, title, audience, event_id) values
  ('b1000000-0000-4000-8000-000000000008', 'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'Hidden link', 'family', 'e1000000-0000-4000-8000-000000000002')$$, 'linking an event the author cannot see');
select pg_temp.denied($$update app.tasks set event_id = 'e1000000-0000-4000-8000-000000000002'
  where id = 'b1000000-0000-4000-8000-000000000001'$$, 'relinking to an event the author cannot see');

-- The member links a family task to their private appointment. The owner sees the task but not the event.
select pg_temp.act('a1000000-0000-4000-8000-000000000002');
insert into app.tasks (id, family_id, author_id, title, audience, assignee_id, event_id) values
  ('b1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002',
   'Bring forms', 'family', 'a1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002');
select pg_temp.denied($$update app.tasks set event_id = null where id = 'b1000000-0000-4000-8000-000000000001'$$,
  'an assignee removing the author''s link');

select pg_temp.act('a1000000-0000-4000-8000-000000000001');
select pg_temp.expect((select e.id is null from app.tasks t left join app.calendar_events e on e.id = t.event_id
  where t.id = 'b1000000-0000-4000-8000-000000000002'), 'the owner sees the task without the hidden event');
update app.tasks set status = 'completed' where id = 'b1000000-0000-4000-8000-000000000002';
select pg_temp.expect((select status = 'completed' from app.tasks where id = 'b1000000-0000-4000-8000-000000000002'),
  'an assignee who cannot see the linked event can still complete the task');

select pg_temp.act('a1000000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) = 0 from app.tasks), 'an outsider sees no linked tasks');

reset role;
select 'Task event link checks passed' as result;
rollback;
