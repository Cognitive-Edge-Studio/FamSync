\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('a8000000-0000-4000-8000-000000000001','dm-owner@example.test',now()),
 ('a8000000-0000-4000-8000-000000000002','dm-member@example.test',now()),
 ('a8000000-0000-4000-8000-000000000003','dm-excluded@example.test',now());
insert into app.families(id,name) values('f8000000-0000-4000-8000-000000000001','DM fixture');
insert into app.family_memberships(family_id,user_id,role) values
 ('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','owner'),
 ('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002','member'),
 ('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000003','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql;raise exception 'Expected rejection';exception when others then
 if sqlstate<>expected then raise exception 'Expected %, received % (%)',expected,sqlstate,sqlerrm;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$
 select set_config('app.actor_id','a8000000-0000-4000-8000-'||lpad(n::text,12,'0'),true) $$;
create function pg_temp.dm() returns uuid language sql as $$
 select id from app.channels where family_id='f8000000-0000-4000-8000-000000000001' and kind='dm' $$;
create function pg_temp.post(n integer) returns void language sql as $$
 select app.post_conversation_message('f8000000-0000-4000-8000-000000000001',pg_temp.dm(),
 ('c8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'DM message',null,
 array['a8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002']::uuid[]) $$;
grant execute on all functions in schema pg_temp to famsync_api,famsync_jobs,authenticated;
set local role famsync_api;
select pg_temp.act(1);
select app.open_direct_conversation('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002');
select pg_temp.reject($q$select app.open_direct_conversation('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001')$q$,'22023');
select pg_temp.act(2);
select app.open_direct_conversation('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*)=1 from app.channels),'reverse pair reuses one DM');
select pg_temp.expect((select count(*)=2 from app.channel_participants),'fixed pair has two participants');
select pg_temp.reject($q$select app.change_channel('f8000000-0000-4000-8000-000000000001',pg_temp.dm(),1,'archive','{"archived":true}')$q$,'42501');
select pg_temp.act(1);
select pg_temp.post(1);
select pg_temp.post(1);
select pg_temp.expect((select last_position=1 from app.channels),'DM retries preserve position');
select pg_temp.reject($q$select app.post_conversation_message('f8000000-0000-4000-8000-000000000001',pg_temp.dm(),gen_random_uuid(),'Bad mention',null,array['a8000000-0000-4000-8000-000000000003']::uuid[])$q$,'22023');
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice('c8000000-0000-4000-8000-000000000001');
select app.deliver_conversation_notice('c8000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.expect((select count(*)=1 from app.conversation_alerts where family_id='f8000000-0000-4000-8000-000000000001'),'one alert, no self alert or retry duplication');
set local role famsync_api;
select pg_temp.act(2);
select pg_temp.expect((select kind='mention' and read_at is null from app.conversation_alerts),'mention replaces generic DM alert');
select app.read_channel('f8000000-0000-4000-8000-000000000001',pg_temp.dm(),1);
select pg_temp.expect((select read_at is not null from app.conversation_alerts),'reading conversation acknowledges alert');
select app.mute_conversation('f8000000-0000-4000-8000-000000000001',pg_temp.dm(),true);
select pg_temp.act(1);
select pg_temp.expect((select not muted from app.channel_participants where user_id=app.actor_id()),'mute is per account');
select pg_temp.post(2);
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice('c8000000-0000-4000-8000-000000000002');
reset role;
select pg_temp.expect(not exists(select 1 from app.conversation_alerts where message_id='c8000000-0000-4000-8000-000000000002'),'mute suppresses mention delivery');
set local role famsync_api;
select pg_temp.act(2);
select pg_temp.expect((select last_read=1 from app.channel_participants where user_id=app.actor_id()),'mute does not mark new messages read');
select app.mute_conversation('f8000000-0000-4000-8000-000000000001',pg_temp.dm(),false);
select pg_temp.act(1);
select pg_temp.post(3);
select pg_temp.act(2);
select app.read_channel('f8000000-0000-4000-8000-000000000001',pg_temp.dm(),3);
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice('c8000000-0000-4000-8000-000000000003');
reset role;
select pg_temp.expect((select read_at is not null from app.conversation_alerts where message_id='c8000000-0000-4000-8000-000000000003'),'late delivery respects saved read position');
set local role famsync_api;
select pg_temp.act(1);
select pg_temp.reject($q$select app.assert_message_task_audience('c8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001',app.actor_id(),'family','{}',1)$q$,'22023');
select pg_temp.reject($q$select app.assert_message_task_audience('c8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001',app.actor_id(),'selected',array['a8000000-0000-4000-8000-000000000003']::uuid[],1)$q$,'22023');
select pg_temp.reject($q$select app.assert_message_task_audience('c8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001',app.actor_id(),'private','{}',99)$q$,'40001');
insert into app.tasks(id,family_id,author_id,title,audience,source_message_id) values
 ('d8000000-0000-4000-8000-000000000001','f8000000-0000-4000-8000-000000000001',app.actor_id(),'Private message task','private','c8000000-0000-4000-8000-000000000001');
select pg_temp.reject($q$update app.tasks set audience='family' where id='d8000000-0000-4000-8000-000000000001'$q$,'22023');
select app.unlink_task_message('f8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001',1);
update app.tasks set audience='family' where id='d8000000-0000-4000-8000-000000000001';
select pg_temp.expect((select audience='family' from app.tasks where id='d8000000-0000-4000-8000-000000000001'),'unlink permits a later visibility change');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.channels),'third member sees no DM');
select pg_temp.expect((select count(*)=0 from app.channel_messages),'third member sees no DM messages');
select pg_temp.act(1);
select pg_temp.post(4);
select app.remove_family_member('f8000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*)=0 from app.channels),'departure hides DM from remaining peer');
select pg_temp.expect((select count(*)=0 from app.channel_messages),'departure hides DM history from remaining peer');
select app.create_channel('f8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001',
 '{"name":"Mention channel","emoji":"💬","topic":"","description":"","memberIds":["a8000000-0000-4000-8000-000000000001","a8000000-0000-4000-8000-000000000003"]}');
select app.post_conversation_message('f8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000005','No mention',null,'{}');
select app.post_conversation_message('f8000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','c8000000-0000-4000-8000-000000000006','Explicit mention',null,array['a8000000-0000-4000-8000-000000000003']::uuid[]);
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice('c8000000-0000-4000-8000-000000000004');
select app.deliver_conversation_notice('c8000000-0000-4000-8000-000000000005');
select app.deliver_conversation_notice('c8000000-0000-4000-8000-000000000006');
reset role;
select pg_temp.expect((select count(*)=0 from app.channel_signal_recipients(pg_temp.dm())),'no signal recipients after departure');
select pg_temp.expect(not exists(select 1 from app.conversation_alerts where message_id='c8000000-0000-4000-8000-000000000004'),'late delivery rechecks membership');
select pg_temp.expect(not exists(select 1 from app.conversation_alerts where message_id='c8000000-0000-4000-8000-000000000005'),'a newer alert replaces an ordinary channel alert');
select pg_temp.expect((select count(*)=1 from app.conversation_alerts where message_id='c8000000-0000-4000-8000-000000000006' and recipient_id='a8000000-0000-4000-8000-000000000003' and kind='mention'),'channel alerts only the explicit participant mention');
rollback;
