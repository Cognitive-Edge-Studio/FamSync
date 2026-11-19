-- Outbox and jobs role boundaries. Everything rolls back.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('a2000000-0000-4000-8000-000000000001', 'jobs-owner@example.test', now());
insert into app.families (id, name, time_zone) values ('f2000000-0000-4000-8000-000000000001', 'Jobs family', 'UTC');
insert into app.family_memberships (family_id, user_id, role)
  values ('f2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'owner');
insert into app.tasks (id, family_id, author_id, title, audience)
  values ('b2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 'Private content', 'family');

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

-- The API role can queue work in a request but cannot read, change, or claim it.
set local role famsync_api;
select set_config('app.actor_id', 'a2000000-0000-4000-8000-000000000001', true),
  set_config('app.request_id', 'req-jobs-access-check', true);
insert into app.outbox (kind, family_id, payload, dedupe_key)
  values ('test.check', 'f2000000-0000-4000-8000-000000000001', '{}', 'jobs-access-1');
select pg_temp.denied($$select count(*) from app.outbox$$, 'the API role reading the outbox');
select pg_temp.denied($$update app.outbox set status = 'done'$$, 'the API role updating the outbox');
select pg_temp.denied($$select * from app.invitation_for_delivery(gen_random_uuid(), gen_random_uuid())$$,
  'the API role reading invitation delivery details');
reset role;

-- The jobs role sees queued work with its request ID but cannot read family content.
set local role famsync_jobs;
select pg_temp.expect((select request_id = 'req-jobs-access-check' from app.outbox where dedupe_key = 'jobs-access-1'),
  'queued work keeps the request ID');
select pg_temp.denied($$select count(*) from app.tasks$$, 'the jobs role reading tasks');
select pg_temp.denied($$select count(*) from app.calendar_events$$, 'the jobs role reading events');
select pg_temp.denied($$select count(*) from app.family_invitations$$, 'the jobs role reading invitations');
select pg_temp.denied($$select count(*) from app.profiles$$, 'the jobs role reading profiles');
-- The jobs role may queue follow-up work, such as reminder emails that wait for quiet hours to end.
insert into app.outbox (kind, payload, dedupe_key, available_at) values ('test.check', '{}', 'jobs-access-2', now());
reset role;

-- A duplicate dedupe key is rejected, so retried requests cannot queue the same work twice.
select pg_temp.expect((select count(*) = 1 from app.outbox where dedupe_key = 'jobs-access-1'), 'one row per dedupe key');
do $$
begin
  insert into app.outbox (kind, payload, dedupe_key) values ('test.check', '{}', 'jobs-access-1');
  raise exception 'FAILED: a duplicate dedupe key was accepted';
exception when unique_violation then null;
end
$$;

select 'Jobs access checks passed' as result;
rollback;
