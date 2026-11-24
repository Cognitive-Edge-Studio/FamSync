\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) select ('ac000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'media-push-'||n||'@example.test',now() from generate_series(1,3) n;
insert into app.families(id,name) values('fc000000-0000-4000-8000-000000000001','Media fixture');
insert into app.family_memberships(family_id,user_id,role) values('fc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','owner'),('fc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000002','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql;raise exception 'Expected rejection';exception when others then
 if sqlstate<>expected then raise exception 'Expected %, received % (%) for %',expected,sqlstate,sqlerrm,sql;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$select set_config('app.actor_id','ac000000-0000-4000-8000-'||lpad(n::text,12,'0'),true)$$;
create function pg_temp.f() returns uuid language sql as $$select 'fc000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.c() returns uuid language sql as $$select 'bc000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.save(n integer,family uuid) returns uuid language sql as $$select app.save_push_subscription(family,'https://fcm.googleapis.com/fcm/send/test-'||n,repeat('k',87),repeat('a',22))$$;
grant execute on all functions in schema pg_temp to famsync_api,famsync_jobs;
set local role famsync_api;
-- Push addresses: private, moved with the browser, removed only by their owner.
select pg_temp.act(1);
select pg_temp.save(1,pg_temp.f());select pg_temp.save(1,pg_temp.f());
select pg_temp.expect((select count(*)=1 from app.push_subscriptions),'saving again keeps one');
select pg_temp.act(3);
select pg_temp.reject($q$select pg_temp.save(9,pg_temp.f())$q$,'P0002');
select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.push_subscriptions),'other people’s addresses are hidden');
select app.remove_push_subscription('https://fcm.googleapis.com/fcm/send/test-1');
select pg_temp.act(1);
select pg_temp.expect((select count(*)=1 from app.push_subscriptions),'only the owner removes an address');
select pg_temp.reject($q$insert into app.push_subscriptions(user_id,endpoint,p256dh,auth) values(app.actor_id(),'https://x',repeat('k',87),repeat('a',22))$q$,'42501');
select pg_temp.reject($q$select app.queue_push(app.actor_id(),gen_random_uuid(),null,'x')$q$,'42501');
select pg_temp.act(2);
select pg_temp.save(1,pg_temp.f());
select pg_temp.act(1);
select pg_temp.expect((select count(*)=0 from app.push_subscriptions),'signing in as someone else moves the address');
select pg_temp.act(2);
select count(pg_temp.save(n,pg_temp.f())) from generate_series(2,14) n;
select pg_temp.expect((select count(*)<=11 from app.push_subscriptions),'old browsers are dropped');
select app.remove_push_subscription(endpoint) from app.push_subscriptions;
select pg_temp.save(1,pg_temp.f());select pg_temp.save(2,pg_temp.f());
-- One job per browser, none for the author, identifiers only.
select pg_temp.act(1);
select app.create_channel(pg_temp.f(),pg_temp.c(),'{"name":"Media","emoji":"💬","topic":"","description":"","memberIds":["ac000000-0000-4000-8000-000000000001","ac000000-0000-4000-8000-000000000002"]}');
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),'cc000000-0000-4000-8000-000000000001','Secret words',null,'{}');
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice('cc000000-0000-4000-8000-000000000001');select app.deliver_conversation_notice('cc000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.expect((select count(*)=2 from app.outbox where kind='push.send' and family_id=pg_temp.f()),'one push per browser');
select pg_temp.expect(not exists(select 1 from app.outbox where kind='push.send' and (payload::text like '%Secret%' or payload::text like '%https:%')),'push jobs carry no content or address');
-- Read and muted conversations queue nothing.
delete from app.outbox where family_id=pg_temp.f();
set local role famsync_api;
select pg_temp.act(1);
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),'cc000000-0000-4000-8000-000000000002','Read already',null,'{}');
select pg_temp.act(2);select app.read_channel(pg_temp.f(),pg_temp.c(),2);
reset role;
set local role famsync_jobs;select app.deliver_conversation_notice('cc000000-0000-4000-8000-000000000002');reset role;
select pg_temp.expect((select count(*)=0 from app.outbox where kind='push.send' and family_id=pg_temp.f()),'a message already read is not pushed');
-- Voice notes: only the uploader's own finished recording.
insert into app.folders(id,family_id,channel_id,name,audience,chat_uploads) values('dc000000-0000-4000-8000-000000000001',pg_temp.f(),pg_temp.c(),'Chat files','family',true);
insert into app.stored_files(id,family_id,folder_id,author_id,file_name,mime,byte_size,content_hash,object_key,target_version,state) values
 ('ec000000-0000-4000-8000-000000000001',pg_temp.f(),'dc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','Voice message.m4a','audio/mp4',100,repeat('0',64),'test/voice',1,'ready'),
 ('ec000000-0000-4000-8000-000000000002',pg_temp.f(),'dc000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','clip.mp4','video/mp4',100,repeat('0',64),'test/video',1,'ready');
set local role famsync_api;
select pg_temp.act(2);
select pg_temp.reject($q$select app.set_voice_note(pg_temp.f(),'ec000000-0000-4000-8000-000000000001',5)$q$,'P0002');
select pg_temp.act(1);
select app.set_voice_note(pg_temp.f(),'ec000000-0000-4000-8000-000000000001',5);
select pg_temp.expect((select voice_seconds=5 from app.stored_files where id='ec000000-0000-4000-8000-000000000001'),'length saved');
select pg_temp.reject($q$select app.set_voice_note(pg_temp.f(),'ec000000-0000-4000-8000-000000000001',99999)$q$,'23514');
select pg_temp.reject($q$select app.set_voice_note(pg_temp.f(),'ec000000-0000-4000-8000-000000000002',5)$q$,'P0002');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.stored_files),'an outsider sees no recording');
reset role;
delete from app.family_memberships where user_id='ac000000-0000-4000-8000-000000000002';
delete from app.families where id=pg_temp.f();
select pg_temp.expect((select count(*)=0 from app.push_subscriptions where family_id=pg_temp.f()),'deleting a family removes its push addresses');
rollback;
