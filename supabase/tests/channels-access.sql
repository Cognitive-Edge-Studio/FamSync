\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('a7000000-0000-4000-8000-000000000001','channel-owner@example.test',now()),
 ('a7000000-0000-4000-8000-000000000002','channel-member@example.test',now()),
 ('a7000000-0000-4000-8000-000000000003','channel-excluded@example.test',now()),
 ('a7000000-0000-4000-8000-000000000004','channel-outsider@example.test',now());
insert into app.families(id,name) values('f7000000-0000-4000-8000-000000000001','Channel fixture');
insert into app.family_memberships(family_id,user_id,role) values
 ('f7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','owner'),
 ('f7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002','member'),
 ('f7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000003','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql;raise exception 'Expected rejection';exception when others then
 if sqlstate<>expected then raise exception 'Expected %, received % (%)',expected,sqlstate,sqlerrm;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$
 select set_config('app.actor_id','a7000000-0000-4000-8000-'||lpad(n::text,12,'0'),true) $$;
grant execute on all functions in schema pg_temp to famsync_api,authenticated,famsync_jobs;
set local role famsync_api;
select pg_temp.act(2);
select app.create_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 '{"name":"Family plan","emoji":"💬","topic":"Weekend","description":"Fixture","memberIds":["a7000000-0000-4000-8000-000000000001","a7000000-0000-4000-8000-000000000002"]}');
-- Same creation ID is safe to retry.
select app.create_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 '{"name":"Family plan","emoji":"💬","topic":"Weekend","description":"Fixture","memberIds":["a7000000-0000-4000-8000-000000000001","a7000000-0000-4000-8000-000000000002"]}');
select pg_temp.expect((select count(*)=1 from app.channels),'creation retry produces one channel');
select app.post_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 'c7000000-0000-4000-8000-000000000001','Original message',null);
select app.post_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 'c7000000-0000-4000-8000-000000000001','Original message',null);
select pg_temp.expect((select last_position=1 from app.channels),'message retry consumes one ordered position');
select pg_temp.reject($q$select app.post_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 'c7000000-0000-4000-8000-000000000001','Different retry',null)$q$,'23505');
select pg_temp.act(1);
select app.post_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 'c7000000-0000-4000-8000-000000000002','Reply','c7000000-0000-4000-8000-000000000001');
savepoint nested_reply;
select app.post_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',
 'c7000000-0000-4000-8000-000000000003','Nested','c7000000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*)=1 from app.channel_messages where reply_to_id='c7000000-0000-4000-8000-000000000002'),'a reply can answer a reply');
rollback to nested_reply;
select pg_temp.reject($q$select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',1,'archive','{"archived":true}')$q$,'42501');
select app.react_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','👍',true);
select app.react_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','👍',true);
select pg_temp.expect((select count(*)=1 from app.channel_reactions),'reaction desired-state retry is idempotent');
select app.react_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','👍',false);
select pg_temp.expect((select count(*)=0 from app.channel_reactions),'reaction can be removed');
select app.read_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',2);
select app.read_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',0);
select pg_temp.expect((select last_read=2 from app.channel_participants where user_id='a7000000-0000-4000-8000-000000000001'),'read position never regresses');
select pg_temp.reject($q$select app.read_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',99)$q$,'22023');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.channels),'nonparticipant sees no channel');
select pg_temp.expect((select count(*)=0 from app.channel_messages),'nonparticipant sees no history');
select pg_temp.expect((select count(*)=0 from app.channel_participants),'nonparticipant sees no roster or read positions');
select pg_temp.reject($q$select app.post_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',gen_random_uuid(),'Unauthorized',null)$q$,'P0002');
select pg_temp.act(4);
select pg_temp.expect((select count(*)=0 from app.channels),'outsider sees no channel');
select pg_temp.act(2);
select pg_temp.reject($q$select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',2,'archive','{"archived":true}')$q$,'40001');
select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',1,'archive','{"archived":true}');
select pg_temp.reject($q$select app.post_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',gen_random_uuid(),'Archived',null)$q$,'22023');
select pg_temp.reject($q$select app.react_channel_message('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','c7000000-0000-4000-8000-000000000001','👍',true)$q$,'22023');
select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',2,'archive','{"archived":false}');
select pg_temp.reject($q$select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',3,'details',
 '{"name":"Invalid members","emoji":"💬","topic":"","description":"","memberIds":["a7000000-0000-4000-8000-000000000001"]}')$q$,'22023');
select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',3,'details',
 '{"name":"Family plan","emoji":"💬","topic":"Weekend","description":"Fixture","memberIds":["a7000000-0000-4000-8000-000000000002","a7000000-0000-4000-8000-000000000003"]}');
select pg_temp.expect((select last_read=2 from app.channel_participants where user_id='a7000000-0000-4000-8000-000000000003'),'new participant starts at join position');
select pg_temp.act(1);
select pg_temp.expect((select count(*)=0 from app.channels),'family owner loses channel access after participant removal');
-- Restore the owner as a participant before testing manager departure.
select pg_temp.act(2);
select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',4,'details',
 '{"name":"Family plan","emoji":"💬","topic":"Weekend","description":"Fixture","memberIds":["a7000000-0000-4000-8000-000000000001","a7000000-0000-4000-8000-000000000002"]}');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000001',true);
select pg_temp.expect(app.can_receive_channel_signal('famsync:channel:b7000000-0000-4000-8000-000000000001:a7000000-0000-4000-8000-000000000001'),'participant can subscribe to own topic');
select pg_temp.expect(not app.can_receive_channel_signal('famsync:channel:b7000000-0000-4000-8000-000000000001:a7000000-0000-4000-8000-000000000002'),'participant cannot subscribe as another user');
select set_config('request.jwt.claim.sub','a7000000-0000-4000-8000-000000000003',true);
select pg_temp.expect(not app.can_receive_channel_signal('famsync:channel:b7000000-0000-4000-8000-000000000001:a7000000-0000-4000-8000-000000000003'),'removed participant cannot subscribe');
select pg_temp.reject($q$select * from app.channel_messages$q$,'42501');
reset role;
set local role famsync_api;
select pg_temp.act(1);
select app.remove_family_member('f7000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000002');
select pg_temp.expect((select manager_id='a7000000-0000-4000-8000-000000000001'::uuid from app.channels),'manager departure transfers to remaining participant');
select pg_temp.act(2);
select pg_temp.expect((select count(*)=0 from app.channel_messages),'removed family member loses all history access');
reset role;
set local role famsync_jobs;
select pg_temp.expect((select count(*)=1 from app.channel_signal_recipients('b7000000-0000-4000-8000-000000000001')),'publisher resolves only current participants');
select pg_temp.reject($q$select * from app.channel_messages$q$,'42501');
reset role;
select pg_temp.expect(not exists(select 1 from app.outbox where kind='channel.refresh' and payload ? 'body'),'refresh outbox contains no message text');
update app.channels set manager_id=null where id='b7000000-0000-4000-8000-000000000001';
set local role famsync_api;
select pg_temp.act(1);
select pg_temp.reject($q$select app.change_channel('f7000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001',1,'archive','{"archived":true}')$q$,'42501');
reset role;
rollback;
