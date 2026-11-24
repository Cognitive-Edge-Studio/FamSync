\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) select ('ab000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'chat-live-'||n||'@example.test',now() from generate_series(1,4) n;
insert into app.families(id,name,channel_guests_allowed) values('fb000000-0000-4000-8000-000000000001','Chat live fixture',true);
insert into app.family_memberships(family_id,user_id,role) values
 ('fb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000001','owner'),
 ('fb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002','member'),
 ('fb000000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000003','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql;raise exception 'Expected rejection';exception when others then
 if sqlstate<>expected then raise exception 'Expected %, received % (%) for %',expected,sqlstate,sqlerrm,sql;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$select set_config('app.actor_id','ab000000-0000-4000-8000-'||lpad(n::text,12,'0'),true)$$;
create function pg_temp.f() returns uuid language sql as $$select 'fb000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.c() returns uuid language sql as $$select 'bb000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.m(n integer) returns uuid language sql as $$select ('cb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.u(n integer) returns uuid language sql as $$select ('ab000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
grant execute on all functions in schema pg_temp to famsync_api,famsync_jobs;
set local role famsync_api;
select pg_temp.act(1);
select app.create_channel(pg_temp.f(),pg_temp.c(),'{"name":"Live","emoji":"💬","topic":"","description":"","memberIds":["ab000000-0000-4000-8000-000000000001","ab000000-0000-4000-8000-000000000002"]}');
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'One',null,'{}');
reset role;
delete from app.outbox where family_id=pg_temp.f();
set local role famsync_api;
-- Delivered, then read; the author alone is signalled.
select pg_temp.act(2);
select app.mark_delivered(pg_temp.f(),jsonb_build_array(jsonb_build_object('id',pg_temp.c(),'position',99)));
select pg_temp.act(1);
select pg_temp.expect((select delivered_position=1 and read_position=0 from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(2)),'delivered is capped at the last message and is not read');
reset role;
select pg_temp.expect((select array_agg(payload->'users')=array['["ab000000-0000-4000-8000-000000000001"]'::jsonb] from app.outbox where family_id=pg_temp.f()),'delivery signals only the author');
delete from app.outbox where family_id=pg_temp.f();
set local role famsync_api;
select pg_temp.act(2);
select app.mark_delivered(pg_temp.f(),jsonb_build_array(jsonb_build_object('id',pg_temp.c(),'position',1)));
select app.read_channel(pg_temp.f(),pg_temp.c(),1);
select pg_temp.act(1);
select pg_temp.expect((select read_position=1 from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(2)),'read is shown');
-- Private reading: no read position, no signal to the author, and nothing revealed later.
select pg_temp.act(2);
select app.set_chat_privacy(false,false);
select pg_temp.act(1);
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(2),'Two',null,'{}');
select pg_temp.act(2);
select app.mark_delivered(pg_temp.f(),jsonb_build_array(jsonb_build_object('id',pg_temp.c(),'position',2)));
reset role;
delete from app.outbox where family_id=pg_temp.f();
set local role famsync_api;
select pg_temp.act(2);
select app.read_channel(pg_temp.f(),pg_temp.c(),2);
reset role;
select pg_temp.expect((select count(*)=1 and bool_and(payload->'users'='["ab000000-0000-4000-8000-000000000002"]'::jsonb) from app.outbox where family_id=pg_temp.f()),'private reading signals only the reader');
set local role famsync_api;
select pg_temp.act(1);
select pg_temp.expect((select read_position is null and delivered_position=2 from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(2)),'a private reader shows delivery only');
select pg_temp.act(2);
select pg_temp.expect((select read_position is null from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(1)),'and cannot see other people’s receipts');
select app.set_chat_privacy(true,true);
select pg_temp.act(1);
select pg_temp.expect((select read_position=1 from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(2)),'turning sharing on does not reveal the private read');
select pg_temp.expect((select count(*)=0 from app.chat_privacy),'privacy settings are visible only to their owner');
select pg_temp.reject($q$select * from app.user_presence$q$,'42501');
-- A later member is not waited for.
select app.change_channel(pg_temp.f(),pg_temp.c(),1,'details','{"name":"Live","emoji":"💬","topic":"","description":"","memberIds":["ab000000-0000-4000-8000-000000000001","ab000000-0000-4000-8000-000000000002","ab000000-0000-4000-8000-000000000003"]}');
select pg_temp.expect((select joined_position=2 from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(3)),'joining position is saved');
-- Presence.
select pg_temp.act(2);select app.set_presence(true);
select pg_temp.act(1);
select pg_temp.expect((select online and last_seen is not null from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(2)),'online is shown');
select app.set_chat_privacy(true,false);
select pg_temp.expect((select online is null and last_seen is null from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(2)),'hiding presence hides other people’s');
select app.set_presence(true);
reset role;
select pg_temp.expect(not exists(select 1 from app.user_presence where user_id=pg_temp.u(1)),'hidden presence is not stored');
update app.user_presence set active_at=clock_timestamp()-interval '5 minutes' where user_id=pg_temp.u(2);
set local role famsync_api;
select pg_temp.act(3);
select pg_temp.expect((select not online from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(2)),'a stale heartbeat is not online');
reset role;
-- A guest takes part in receipts but not presence.
insert into app.channel_guest_grants(channel_id,family_id,user_id,email) values(pg_temp.c(),pg_temp.f(),pg_temp.u(4),'chat-live-4@example.test');
insert into app.channel_participants(channel_id,family_id,user_id) values(pg_temp.c(),pg_temp.f(),pg_temp.u(4));
set local role famsync_api;
select pg_temp.act(4);
select app.set_presence(true);
select pg_temp.expect((select bool_and(online is null and last_seen is null) from app.conversation_status(pg_temp.c())),'a guest sees nobody’s presence');
select pg_temp.act(3);
select pg_temp.expect((select online is null from app.conversation_status(pg_temp.c()) where user_id=pg_temp.u(4)),'and shows none');
-- Typing recipients: both sides must share presence.
select pg_temp.reject($q$select * from app.typing_recipients(pg_temp.c(),pg_temp.u(2))$q$,'42501');
reset role;
set local role famsync_jobs;
select pg_temp.expect((select array_agg(user_id order by user_id)=array[pg_temp.u(3),pg_temp.u(4)] from app.typing_recipients(pg_temp.c(),pg_temp.u(2))),'people hiding presence get no typing signal');
select pg_temp.expect((select count(*)=0 from app.typing_recipients(pg_temp.c(),pg_temp.u(1))),'and send none');
select pg_temp.expect((select count(*)=0 from app.typing_recipients(pg_temp.c(),'ab000000-0000-4000-8000-0000000000ff')),'an outsider cannot send typing');
-- Group alerts: one unread message alert per person, mentions kept, mute respected.
reset role;
delete from app.conversation_alerts where family_id=pg_temp.f();
set local role famsync_api;
select pg_temp.act(1);
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(3),'Three',null,array[pg_temp.u(3)]);
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(4),'Four',null,'{}');
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(5),'Five',null,'{}');
select pg_temp.act(2);select app.mute_conversation(pg_temp.f(),pg_temp.c(),true);
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice(pg_temp.m(3));select app.deliver_conversation_notice(pg_temp.m(4));select app.deliver_conversation_notice(pg_temp.m(5));select app.deliver_conversation_notice(pg_temp.m(5));
reset role;
select pg_temp.expect((select count(*)=0 from app.conversation_alerts where recipient_id in(pg_temp.u(1),pg_temp.u(2)) and family_id=pg_temp.f()),'no alert for the author or a muted member');
select pg_temp.expect((select array_agg(kind order by kind)=array['mention','message'] from app.conversation_alerts where recipient_id=pg_temp.u(3)),'one message alert and the mention remain');
select pg_temp.expect((select message_id=pg_temp.m(5) from app.conversation_alerts where recipient_id=pg_temp.u(3) and kind='message'),'the alert points at the newest message');
-- A mention added by editing upgrades the alert.
set local role famsync_api;
select pg_temp.act(1);
select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(5),0,'Five!',array[pg_temp.u(3)]);
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice(pg_temp.m(5));
reset role;
select pg_temp.expect((select kind='mention' from app.conversation_alerts where recipient_id=pg_temp.u(3) and message_id=pg_temp.m(5)),'an edited-in mention is alerted');
set local role famsync_api;
select pg_temp.act(4);select app.leave_channel(pg_temp.f(),pg_temp.c());
select pg_temp.expect((select count(*)=0 from app.conversation_status(pg_temp.c())),'no status after leaving');
reset role;
rollback;
