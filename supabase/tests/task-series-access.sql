-- Chore series access checks against the restricted API role. Everything rolls back.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('c0000000-0000-4000-8000-000000000001', 'series-owner@example.test', now()),
  ('c0000000-0000-4000-8000-000000000002', 'series-member@example.test', now()),
  ('c0000000-0000-4000-8000-000000000003', 'series-excluded@example.test', now()),
  ('c0000000-0000-4000-8000-000000000004', 'series-outsider@example.test', now());
insert into app.families (id, name, time_zone) values
  ('e0000000-0000-4000-8000-000000000001', 'Series family', 'America/Toronto'),
  ('e0000000-0000-4000-8000-000000000002', 'Other family', 'UTC');
insert into app.family_memberships (family_id, user_id, role) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'owner'),
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'member'),
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'member'),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000004', 'owner');

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

select pg_temp.act('c0000000-0000-4000-8000-000000000001');
insert into app.task_series (id, family_id, author_id, title, audience, assignee_id, due_time, time_zone,
  frequency, repeat_interval, start_date) values
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'Feed the cat', 'family', 'c0000000-0000-4000-8000-000000000002', '02:30', 'America/Toronto', 'daily', 1, '2027-03-13');
insert into app.task_series (id, family_id, author_id, title, audience, selected_member_ids, assignee_id, time_zone,
  frequency, repeat_interval, start_date) values
  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'Selected chore', 'selected', '{c0000000-0000-4000-8000-000000000002}', 'c0000000-0000-4000-8000-000000000002',
   'America/Toronto', 'weekly', 1, '2027-03-13');
select pg_temp.denied($$insert into app.task_series (id, family_id, author_id, title, audience, assignee_id, time_zone,
  frequency, repeat_interval, start_date) values ('d0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', 'Outsider chore', 'family', 'c0000000-0000-4000-8000-000000000004',
  'America/Toronto', 'daily', 1, '2027-03-13')$$, 'a series assigned to a non-member');

select app.generate_task_occurrences('d0000000-0000-4000-8000-000000000001', '2027-03-15',
  '{2027-03-13,2027-03-14,2027-03-15}');
select app.generate_task_occurrences('d0000000-0000-4000-8000-000000000001', '2027-03-15',
  '{2027-03-13,2027-03-14,2027-03-15,2027-03-16}');
select pg_temp.expect((select count(*) = 3 from app.tasks where series_id = 'd0000000-0000-4000-8000-000000000001'),
  'repeated generation creates one row per date and nothing after the requested day');
select pg_temp.expect((select due_at = '2027-03-14T07:30:00Z' from app.tasks
  where series_id = 'd0000000-0000-4000-8000-000000000001' and occurrence_date = '2027-03-14'),
  'a due time in a daylight-saving gap moves to the next valid time');
select pg_temp.expect((select generated_through = '2027-03-15' from app.task_series
  where id = 'd0000000-0000-4000-8000-000000000001'), 'generation records how far it has run');
select app.generate_task_occurrences('d0000000-0000-4000-8000-000000000002', '2027-03-15', '{2027-03-13}');

-- An excluded member cannot see or generate the selected series.
select pg_temp.act('c0000000-0000-4000-8000-000000000003');
select pg_temp.expect((select count(*) = 1 from app.task_series), 'an excluded member sees only the family series');
select pg_temp.expect((select count(*) = 3 from app.tasks), 'an excluded member sees only family occurrences');
select pg_temp.denied($$select app.generate_task_occurrences('d0000000-0000-4000-8000-000000000002', '2027-03-20',
  '{2027-03-20}')$$, 'generating a hidden series');
select pg_temp.expect((select count(*) = 1 from app.tasks t, app.task_series_rule(t.id) r
  where t.series_id = 'd0000000-0000-4000-8000-000000000001' and t.occurrence_date = '2027-03-13'),
  'the rule lookup answers for a visible occurrence');
select pg_temp.expect((select count(*) = 0 from app.task_series_rule(
  (select id from app.tasks where series_id = 'd0000000-0000-4000-8000-000000000002' limit 1))),
  'the rule lookup returns nothing for a hidden occurrence');

select pg_temp.act('c0000000-0000-4000-8000-000000000004');
select pg_temp.expect((select count(*) = 0 from app.task_series), 'an outsider sees no series');
select pg_temp.denied($$select app.generate_task_occurrences('d0000000-0000-4000-8000-000000000001', '2027-03-20',
  '{2027-03-20}')$$, 'an outsider generating a series');

-- The assignee completes one occurrence but cannot edit or archive the series or its occurrences.
select pg_temp.act('c0000000-0000-4000-8000-000000000002');
update app.tasks set status = 'completed'
where series_id = 'd0000000-0000-4000-8000-000000000001' and occurrence_date = '2027-03-15';
select pg_temp.expect((select count(*) filter (where status = 'completed') = 1 from app.tasks
  where series_id = 'd0000000-0000-4000-8000-000000000001'), 'completing one occurrence leaves the others open');
update app.task_series set title = 'Renamed' where id = 'd0000000-0000-4000-8000-000000000001';
select pg_temp.expect((select title = 'Feed the cat' from app.task_series where id = 'd0000000-0000-4000-8000-000000000001'),
  'an assignee cannot edit the series');
select pg_temp.denied($$update app.tasks set archived_at = now()
  where series_id = 'd0000000-0000-4000-8000-000000000001' and occurrence_date = '2027-03-13'$$, 'an assignee archiving an occurrence');

-- The author archives an occurrence. Removing the member clears the series assignee.
select pg_temp.act('c0000000-0000-4000-8000-000000000001');
update app.tasks set archived_at = now()
where series_id = 'd0000000-0000-4000-8000-000000000001' and occurrence_date = '2027-03-13';
select pg_temp.expect((select archived_at is not null and version = 2 from app.tasks
  where series_id = 'd0000000-0000-4000-8000-000000000001' and occurrence_date = '2027-03-13'), 'the author archives an occurrence');
select app.remove_family_member('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');
select pg_temp.expect((select assignee_id is null from app.task_series where id = 'd0000000-0000-4000-8000-000000000001'),
  'removal clears the series assignee');
select pg_temp.expect((select assignee_id is null from app.tasks
  where series_id = 'd0000000-0000-4000-8000-000000000001' and occurrence_date = '2027-03-14'),
  'removal unassigns open occurrences');

reset role;
select 'Task series access checks passed' as result;
rollback;
