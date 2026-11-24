\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) select ('ad000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'android-push-'||n||'@example.test',now() from generate_series(1,3) n;
insert into auth.sessions(id,user_id) select ('bd000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('ad000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,3) n;
insert into app.families(id,name) values('fd000000-0000-4000-8000-000000000001','Android fixture'),('fd000000-0000-4000-8000-000000000002','Legacy second family');
insert into app.family_memberships(family_id,user_id,role,joined_at) values
 ('fd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','owner','2026-01-01'),
 ('fd000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002','member','2026-01-01'),
 ('fd000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-000000000002','owner','2026-02-01');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql;raise exception 'Expected rejection';exception when others then
 if sqlstate<>expected then raise exception 'Expected %, received % (%) for %',expected,sqlstate,sqlerrm,sql;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$select set_config('app.actor_id','ad000000-0000-4000-8000-'||lpad(n::text,12,'0'),true)$$;
create function pg_temp.f(n integer default 1) returns uuid language sql as $$select ('fd000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.s(n integer) returns uuid language sql as $$select ('bd000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.d(n integer) returns uuid language sql as $$select ('dd000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.c() returns uuid language sql as $$select 'cd000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.token(n integer) returns text language sql as $$select 'test-fcm-token-installation-'||n$$;
create function pg_temp.save(device integer,session integer,family integer default 1,token integer default 1) returns void language sql as $$
 select app.save_android_push(pg_temp.d(device),pg_temp.s(session),pg_temp.f(family),pg_temp.token(token))
$$;
grant execute on all functions in schema pg_temp to famsync_api,famsync_jobs;
set local role famsync_api;
select pg_temp.act(1);
select pg_temp.save(1,1);select pg_temp.save(1,1);
select pg_temp.expect((select count(*)=1 from app.android_push_devices),'idempotent registration');
select pg_temp.reject($q$select pg_temp.save(2,2)$q$,'42501');
select pg_temp.reject($q$insert into app.android_push_devices(id,user_id,session_id,family_id,token) values(pg_temp.d(2),app.actor_id(),pg_temp.s(1),pg_temp.f(),pg_temp.token(2))$q$,'42501');
select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.android_push_devices),'tokens are private');
select app.remove_android_push(pg_temp.d(1));
select pg_temp.reject($q$select pg_temp.save(2,2,2)$q$,'P0002');
select pg_temp.save(1,2);
select pg_temp.act(1);
select pg_temp.expect((select count(*)=0 from app.android_push_devices),'new account moves the installation');
select pg_temp.act(2);
select pg_temp.save(1,2,1,2);
select pg_temp.expect((select token=pg_temp.token(2) from app.android_push_devices),'rotation replaces old token');
select app.remove_android_push(pg_temp.d(1),pg_temp.token(1));
select pg_temp.expect((select count(*)=1 from app.android_push_devices),'a failed old token cannot retire its replacement');
-- Guest channels still work in the inbox but do not register for another family's Android push.
select pg_temp.act(1);
select app.create_channel(pg_temp.f(),pg_temp.c(),'{"name":"Android","emoji":"x","topic":"","description":"","memberIds":["ad000000-0000-4000-8000-000000000001","ad000000-0000-4000-8000-000000000002"]}');
reset role;
insert into app.channel_guest_grants(channel_id,family_id,user_id,email) values(pg_temp.c(),pg_temp.f(),'ad000000-0000-4000-8000-000000000003','android-push-3@example.test');
set local role famsync_api;
select pg_temp.act(3);select pg_temp.reject($q$select pg_temp.save(3,3)$q$,'P0002');
select pg_temp.act(2);
select app.save_push_subscription(pg_temp.f(),'https://fcm.googleapis.com/fcm/send/android-test',repeat('k',87),repeat('a',22));
select pg_temp.act(1);
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),'ed000000-0000-4000-8000-000000000001','PRIVATE WORDS',null,'{}');
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice('ed000000-0000-4000-8000-000000000001');
select app.deliver_conversation_notice('ed000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.expect((select count(*)=1 from app.outbox where kind='push.send' and family_id=pg_temp.f() and payload->>'transport'='android'),'one native job on repeat delivery');
select pg_temp.expect((select count(*)=1 from app.outbox where kind='push.send' and family_id=pg_temp.f() and not payload ? 'transport'),'web delivery retained');
select pg_temp.expect(not exists(select 1 from app.outbox where kind='push.send' and family_id=pg_temp.f() and (payload::text like '%PRIVATE%' or payload::text like '%fcm-token%')),'jobs have no content or token');
-- Sign-out removal, lost family access, expired sessions and remote session revocation.
set local role famsync_api;
select pg_temp.act(3);
select app.revoke_android_push(pg_temp.d(1),pg_temp.token(1));
select pg_temp.act(2);
select pg_temp.expect((select count(*)=1 from app.android_push_devices),'old token proof cannot remove a rotated token');
select pg_temp.act(3);select app.revoke_android_push(pg_temp.d(1),pg_temp.token(2));
select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.android_push_devices),'offline removal needs only the matching token proof, not a login');
select pg_temp.save(1,2);
select app.remove_android_push(pg_temp.d(1));
select pg_temp.expect((select count(*)=0 from app.android_push_devices),'explicit sign-out removes the registration');
select pg_temp.save(1,2);
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where id=pg_temp.s(2);
set local role famsync_api;select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.android_push_devices),'expired session hides a device at send time');
select pg_temp.reject($q$select pg_temp.save(1,2)$q$,'42501');
reset role;update auth.sessions set not_after=null where id=pg_temp.s(2);
delete from app.family_memberships where family_id=pg_temp.f() and user_id='ad000000-0000-4000-8000-000000000002';
set local role famsync_api;select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.android_push_devices),'lost membership/default family hides a device');
reset role;
delete from auth.sessions where id=pg_temp.s(2);
select pg_temp.expect((select count(*)=0 from app.android_push_devices where id=pg_temp.d(1)),'remote sign-out cascades to registration');
rollback;
