\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) select ('a9000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'chat-change-'||n||'@example.test',now() from generate_series(1,3) n;
insert into app.families(id,name) values('f9000000-0000-4000-8000-000000000001','Chat change fixture');
insert into app.family_memberships(family_id,user_id,role) values
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','owner'),
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','member'),
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000003','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql;raise exception 'Expected rejection';exception when others then
 if sqlstate<>expected then raise exception 'Expected %, received % (%)',expected,sqlstate,sqlerrm;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$
 select set_config('app.actor_id','a9000000-0000-4000-8000-'||lpad(n::text,12,'0'),true) $$;
grant execute on all functions in schema pg_temp to famsync_api;
set local role famsync_api;
select pg_temp.act(1);
select app.create_channel('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001',
 '{"name":"Changes","emoji":"💬","topic":"","description":"","memberIds":["a9000000-0000-4000-8000-000000000001","a9000000-0000-4000-8000-000000000002"]}');
select app.post_channel_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','First',null);
select app.post_channel_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002','Second',null);
select pg_temp.expect((select array_agg(change_seq order by position)=array[1,2] from app.channel_messages),'new messages take ordered markers');
select pg_temp.act(2);
select app.react_channel_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','👍',true);
select pg_temp.expect((select array_agg(body)=array['First'] from app.channel_messages where change_seq>2),'a reaction marks its old message only');
select app.react_channel_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','👍',true);
select pg_temp.expect((select seq=3 from app.channel_change_counters),'a repeated reaction changes nothing');
select app.react_channel_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','👍',false);
select pg_temp.expect((select seq=4 from app.channel_change_counters),'removing a reaction is a change');
-- A retry still succeeds after the mentioned person has left.
select pg_temp.act(1);
select app.post_conversation_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000003','Hi','c9000000-0000-4000-8000-000000000002',array['a9000000-0000-4000-8000-000000000002']::uuid[]);
reset role;
delete from app.channel_participants where channel_id='b9000000-0000-4000-8000-000000000001' and user_id='a9000000-0000-4000-8000-000000000002';
set local role famsync_api;
select app.post_conversation_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000003','Hi','c9000000-0000-4000-8000-000000000002',array['a9000000-0000-4000-8000-000000000002']::uuid[]);
select pg_temp.expect((select count(*)=3 from app.channel_messages),'a retry after a mentioned person leaves adds nothing');
select pg_temp.reject($q$select app.post_conversation_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000004','Hi',null,array['a9000000-0000-4000-8000-000000000002']::uuid[])$q$,'22023');
select pg_temp.reject($q$select app.post_conversation_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000004','Hi','c9000000-0000-4000-8000-0000000000ff','{}')$q$,'22023');
select pg_temp.reject($q$select app.touch_messages('{}')$q$,'42501');
select pg_temp.reject($q$update app.channel_change_counters set seq=0$q$,'42501');
reset role;
-- Linking a task, renaming it and deleting it each mark the source message.
select pg_temp.act(1);
insert into app.tasks(id,family_id,author_id,title,audience,source_message_id) values('d9000000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','Fixture','private','c9000000-0000-4000-8000-000000000002');
select pg_temp.expect((select body='Second' from app.channel_messages where channel_id='b9000000-0000-4000-8000-000000000001' order by change_seq desc limit 1),'linking a task marks its message');
create temp table mark as select seq from app.channel_change_counters where channel_id='b9000000-0000-4000-8000-000000000001';
update app.tasks set title='Renamed' where id='d9000000-0000-4000-8000-000000000001';
delete from app.tasks where id='d9000000-0000-4000-8000-000000000001';
select pg_temp.expect((select c.seq=m.seq+2 from app.channel_change_counters c,mark m where c.channel_id='b9000000-0000-4000-8000-000000000001'),'task rename and deletion mark the message');
set local role famsync_api;
select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.channel_change_counters),'a removed participant cannot read the marker');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.channel_change_counters),'a non-participant cannot read the marker');
reset role;
delete from app.families where id='f9000000-0000-4000-8000-000000000001';
select pg_temp.expect(not exists(select 1 from app.channel_change_counters where channel_id='b9000000-0000-4000-8000-000000000001'),'deleting the family still works');
rollback;
