-- Task access checks against the restricted API role. Everything rolls back.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-4000-8000-000000000001', 'tasks-owner@example.test', now()),
  ('a0000000-0000-4000-8000-000000000002', 'tasks-member@example.test', now()),
  ('a0000000-0000-4000-8000-000000000003', 'tasks-excluded@example.test', now()),
  ('a0000000-0000-4000-8000-000000000004', 'tasks-outsider@example.test', now());
insert into app.families (id, name, time_zone) values
  ('f0000000-0000-4000-8000-000000000001', 'Task access family', 'America/Toronto'),
  ('f0000000-0000-4000-8000-000000000002', 'Other family', 'UTC');
insert into app.family_memberships (family_id, user_id, role) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'owner'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'member'),
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'member'),
  ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'owner');

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

-- The owner creates a family task for the member and a selected task for the member only.
select pg_temp.act('a0000000-0000-4000-8000-000000000001');
insert into app.tasks (id, family_id, author_id, title, audience, assignee_id, due_date) values
  ('b0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'Family chore', 'family', 'a0000000-0000-4000-8000-000000000002', '2026-11-16'),
  ('b0000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'Open chore', 'family', 'a0000000-0000-4000-8000-000000000002', null);
insert into app.tasks (id, family_id, author_id, title, audience, selected_member_ids, assignee_id) values
  ('b0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'Selected chore', 'selected',
   '{a0000000-0000-4000-8000-000000000002}', 'a0000000-0000-4000-8000-000000000002');
select pg_temp.expect((select status = 'todo' and version = 1 from app.tasks where id = 'b0000000-0000-4000-8000-000000000001'),
  'new tasks start in To Do at version 1');
select pg_temp.denied($$insert into app.tasks (id, family_id, author_id, title, audience, assignee_id) values
  ('b0000000-0000-4000-8000-000000000010', 'f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Outsider chore', 'family', 'a0000000-0000-4000-8000-000000000004')$$, 'assigning a non-member');
select pg_temp.denied($$insert into app.tasks (id, family_id, author_id, title, audience, assignee_id) values
  ('b0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Private for someone else', 'private', 'a0000000-0000-4000-8000-000000000002')$$, 'assigning a private task to another member');
select pg_temp.denied($$insert into app.tasks (id, family_id, author_id, title, audience, assignee_id) values
  ('b0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'Written as someone else', 'family', null)$$, 'creating a task as another author');
select pg_temp.denied($$update app.tasks set selected_member_ids = '{a0000000-0000-4000-8000-000000000003}'
  where id = 'b0000000-0000-4000-8000-000000000003'$$, 'an audience change that hides the assignee');

-- The member creates a private task.
select pg_temp.act('a0000000-0000-4000-8000-000000000002');
insert into app.tasks (id, family_id, author_id, title, audience, assignee_id) values
  ('b0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000002', 'Private chore', 'private', 'a0000000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) = 4 from app.tasks), 'the member sees family, selected, and own private tasks');

select pg_temp.act('a0000000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) = 3 from app.tasks), 'the owner cannot see the member''s private task');

select pg_temp.act('a0000000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) = 2 from app.tasks), 'an excluded member sees only family tasks');
update app.tasks set status = 'completed' where id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.expect((select status = 'todo' from app.tasks where id = 'b0000000-0000-4000-8000-000000000001'),
  'a viewer who is not the author or assignee cannot change status');

select pg_temp.act('a0000000-0000-4000-8000-000000000004');
select pg_temp.expect((select count(*) = 0 from app.tasks), 'an outsider sees no tasks');

-- The assignee completes, cannot edit details, and reopens.
select pg_temp.act('a0000000-0000-4000-8000-000000000002');
update app.tasks set status = 'completed' where id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.expect((select status = 'completed' and completed_by = 'a0000000-0000-4000-8000-000000000002'
  and completed_at is not null and version = 2 from app.tasks where id = 'b0000000-0000-4000-8000-000000000001'),
  'completion records who and when and bumps the version');
select pg_temp.denied($$update app.tasks set title = 'Renamed' where id = 'b0000000-0000-4000-8000-000000000001'$$,
  'an assignee editing details');
update app.tasks set status = 'todo' where id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.expect((select status = 'todo' and completed_at is null and completed_by is null and version = 3
  from app.tasks where id = 'b0000000-0000-4000-8000-000000000001'), 'reopening clears completion');
update app.tasks set status = 'completed' where id = 'b0000000-0000-4000-8000-000000000001';

-- Removing the member unassigns their open tasks and ends their access.
select pg_temp.act('a0000000-0000-4000-8000-000000000001');
select app.remove_family_member('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
select pg_temp.expect((select assignee_id is null from app.tasks where id = 'b0000000-0000-4000-8000-000000000004'),
  'removal unassigns open tasks');
select pg_temp.expect((select assignee_id = 'a0000000-0000-4000-8000-000000000002'
  from app.tasks where id = 'b0000000-0000-4000-8000-000000000001'), 'removal keeps the assignee on completed tasks');
select pg_temp.act('a0000000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) = 0 from app.tasks), 'a removed member sees no tasks');

reset role;
select 'Task access checks passed' as result;
rollback;
