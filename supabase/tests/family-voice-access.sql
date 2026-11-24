-- Family voice switches, consent and time limits are checked through the restricted API role. Fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, email_confirmed_at) select ('a9000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'voice-' || n || '@example.test', now() from generate_series(1,3) n;
insert into app.families(id, name) values ('f9000000-0000-4000-8000-000000000001', 'Voice fixture');
insert into app.family_memberships(family_id, user_id, role) values
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','owner'),
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','member');
create function pg_temp.f() returns uuid language sql as $$ select 'f9000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql
as $$ begin if ok is distinct from true then raise exception 'FAILED %', label; end if; end $$;
create function pg_temp.act(actor integer) returns void language plpgsql as $$
begin perform set_config('app.actor_id', 'a9000000-0000-4000-8000-' || lpad(actor::text,12,'0'), true); end $$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin execute sql; ok := true; exception when others then
    if sqlstate <> expected then raise exception 'Expected %, received % (%)', expected, sqlstate, sqlerrm; end if; end;
  if ok then raise exception 'Expected rejection %: %', expected, sql; end if;
end $$;
create function pg_temp.claim(m integer, f integer) returns uuid language sql as $$ select app.claim_family_voice(pg_temp.f(), 1, 60, m, f) $$;
grant execute on all functions in schema pg_temp to famsync_api;
set local role famsync_api;

select pg_temp.act(2);
select pg_temp.reject('select pg_temp.claim(120,180)', '42501');
select pg_temp.reject('select app.set_family_voice(pg_temp.f(), true)', '42501');
select pg_temp.act(3);
select pg_temp.reject('select app.set_family_voice_consent(pg_temp.f(), true, 1)', 'P0002');
select pg_temp.reject('select pg_temp.claim(120,180)', 'P0002');
select pg_temp.expect((select count(*)=0 from app.family_voice_status(pg_temp.f(),1)), 'outsider has no status');
select pg_temp.act(1);
select app.set_family_voice(pg_temp.f(), true);
select pg_temp.act(2);
-- Agreeing to written questions is not agreeing to voice.
select app.set_family_ai_consent(pg_temp.f(), true, 1);
select pg_temp.reject('select pg_temp.claim(120,180)', '42501');
select app.set_family_voice_consent(pg_temp.f(), true, 1);
select pg_temp.expect((select enabled and consented and not can_manage and member_used=0 from app.family_voice_status(pg_temp.f(),1)), 'member ready');
select pg_temp.expect((select not consented from app.family_voice_status(pg_temp.f(),2)), 'a new notice needs new consent');
select set_config('test.claim', pg_temp.claim(120,180)::text, true);
select app.settle_family_voice(current_setting('test.claim')::uuid, 20);
select pg_temp.expect((select member_used=20 from app.family_voice_status(pg_temp.f(),1)), 'the reservation becomes real use');
select app.settle_family_voice(current_setting('test.claim')::uuid, 500);
select pg_temp.expect((select member_used=20 from app.family_voice_status(pg_temp.f(),1)), 'use is never raised afterwards');
select pg_temp.expect(pg_temp.claim(120,180) is not null and pg_temp.claim(120,180) is not null, 'more turns');
select pg_temp.reject('select pg_temp.claim(120,180)', '53400');
select pg_temp.act(1);
select app.settle_family_voice(current_setting('test.claim')::uuid, 0);
select pg_temp.expect((select family_used=140 from app.family_voice_status(pg_temp.f(),1)), 'another member cannot lower a use');
select app.set_family_voice_consent(pg_temp.f(), true, 1);
select pg_temp.expect(pg_temp.claim(120,180) is not null, 'the owner may still talk');
select pg_temp.reject('select pg_temp.claim(120,180)', '53400');
select app.set_family_voice_consent(pg_temp.f(), false, 1);
select pg_temp.reject('select pg_temp.claim(900,900)', '42501');
select pg_temp.reject('select * from app.family_voice_usage', '42501');
select pg_temp.reject('select * from app.family_voice_consents', '42501');
select pg_temp.reject('select * from app.family_voice_settings', '42501');
select app.set_family_voice(pg_temp.f(), false);
select pg_temp.act(2);
select pg_temp.reject('select pg_temp.claim(900,900)', '42501');
reset role;
delete from app.family_memberships where user_id='a9000000-0000-4000-8000-000000000002';
select pg_temp.expect((select count(*)=0 from app.family_voice_consents), 'leaving withdraws consent');
rollback;
select 'Family voice access checks passed' as result;
