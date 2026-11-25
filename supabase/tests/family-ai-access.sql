-- Family AI switches, consent and limits are checked through the restricted API role. Fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, email_confirmed_at) select ('a8000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'ai-' || n || '@example.test', now() from generate_series(1,3) n;
insert into app.families(id, name) values ('f8000000-0000-4000-8000-000000000001', 'AI fixture');
insert into app.family_memberships(family_id, user_id, role) values
 ('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','owner'),
 ('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002','member');
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql
as $$ begin if ok is distinct from true then raise exception 'FAILED %', label; end if; end $$;
create function pg_temp.act(actor integer) returns void language plpgsql as $$
begin perform set_config('app.actor_id', 'a8000000-0000-4000-8000-' || lpad(actor::text,12,'0'), true); end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute sql; ok := true; exception when others then
    if sqlstate <> expected then raise exception 'Expected %, received % (%)', expected, sqlstate, sqlerrm; end if; end;
  if ok then raise exception 'Expected rejection %: %', expected, sql; end if;
end $$;
create function pg_temp.claim(m integer, f integer) returns uuid language sql as
  $$ select app.claim_family_ai_question('f8000000-0000-4000-8000-000000000001', 1, m, f) $$;
grant execute on function pg_temp.expect(boolean,text), pg_temp.act(integer), pg_temp.reject(text,text), pg_temp.claim(integer,integer) to famsync_api;
set local role famsync_api;

select pg_temp.act(2);
select pg_temp.expect((select enabled and not consented and not can_manage from app.family_ai_status('f8000000-0000-4000-8000-000000000001',1)), 'default on does not grant consent');
select pg_temp.reject('select pg_temp.claim(2,3)', '42501');
select pg_temp.reject($q$select app.set_family_ai('f8000000-0000-4000-8000-000000000001', true)$q$, '42501');
select pg_temp.act(3);
select pg_temp.reject($q$select app.set_family_ai_consent('f8000000-0000-4000-8000-000000000001', true, 1)$q$, 'P0002');
select pg_temp.reject('select pg_temp.claim(2,3)', 'P0002');
select pg_temp.expect((select count(*)=0 from app.family_ai_status('f8000000-0000-4000-8000-000000000001',1)), 'outsider has no status');
select pg_temp.act(1);
select app.set_family_ai('f8000000-0000-4000-8000-000000000001', true);
select pg_temp.reject('select pg_temp.claim(2,3)', '42501');
select pg_temp.act(2);
select app.set_family_ai_consent('f8000000-0000-4000-8000-000000000001', true, 1);
select pg_temp.expect((select enabled and consented and not can_manage and member_used=0 from app.family_ai_status('f8000000-0000-4000-8000-000000000001',1)), 'member ready');
select pg_temp.expect((select not consented from app.family_ai_status('f8000000-0000-4000-8000-000000000001',2)), 'a new notice needs new consent');
select pg_temp.expect(pg_temp.claim(2,3) is not null and pg_temp.claim(2,3) is not null, 'two questions allowed');
select pg_temp.reject('select pg_temp.claim(2,3)', '53400');
select pg_temp.act(1);
select app.set_family_ai_consent('f8000000-0000-4000-8000-000000000001', true, 1);
select set_config('test.claim', pg_temp.claim(2,3)::text, true);
select pg_temp.reject('select pg_temp.claim(2,3)', '53400');
select pg_temp.act(2);
select app.release_family_ai_question(current_setting('test.claim')::uuid);
select pg_temp.expect((select family_used=3 from app.family_ai_status('f8000000-0000-4000-8000-000000000001',1)), 'another member cannot release a question');
select pg_temp.act(1);
select app.release_family_ai_question(current_setting('test.claim')::uuid);
select pg_temp.expect((select family_used=2 from app.family_ai_status('f8000000-0000-4000-8000-000000000001',1)), 'own question released');
select app.set_family_ai_consent('f8000000-0000-4000-8000-000000000001', false, 1);
select pg_temp.reject('select pg_temp.claim(2,3)', '42501');
select pg_temp.reject('select * from app.family_ai_usage', '42501');
select pg_temp.reject('select * from app.family_ai_consents', '42501');
select app.set_family_ai('f8000000-0000-4000-8000-000000000001', false);
select pg_temp.expect((select not enabled from app.family_ai_status('f8000000-0000-4000-8000-000000000001',1)), 'explicit family opt-out overrides default');
select pg_temp.act(2);
select pg_temp.reject('select pg_temp.claim(9,9)', '42501');
reset role;
delete from app.family_memberships where user_id='a8000000-0000-4000-8000-000000000002';
select pg_temp.expect((select count(*)=0 from app.family_ai_consents), 'leaving withdraws consent');
rollback;
select 'Family AI access checks passed' as result;
