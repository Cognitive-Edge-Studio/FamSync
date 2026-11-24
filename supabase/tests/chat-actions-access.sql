\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) select ('aa000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'chat-action-'||n||'@example.test',now() from generate_series(1,4) n;
insert into app.families(id,name,channel_guests_allowed) values('fa000000-0000-4000-8000-000000000001','Chat action fixture',true);
insert into app.family_memberships(family_id,user_id,role) values
 ('fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','owner'),
 ('fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','member'),
 ('fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$
begin execute sql;raise exception 'Expected rejection';exception when others then
 if sqlstate<>expected then raise exception 'Expected %, received % (%) for %',expected,sqlstate,sqlerrm,sql;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$
 select set_config('app.actor_id','aa000000-0000-4000-8000-'||lpad(n::text,12,'0'),true) $$;
create function pg_temp.f() returns uuid language sql as $$select 'fa000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.c() returns uuid language sql as $$select 'ba000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.m(n integer) returns uuid language sql as $$select ('ca000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.u(n integer) returns uuid language sql as $$select ('aa000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
grant execute on all functions in schema pg_temp to famsync_api;
set local role famsync_api;
select pg_temp.act(1);
select app.create_channel(pg_temp.f(),pg_temp.c(),'{"name":"Actions","emoji":"💬","topic":"","description":"","memberIds":["aa000000-0000-4000-8000-000000000001","aa000000-0000-4000-8000-000000000002","aa000000-0000-4000-8000-000000000003"]}');
reset role;
-- User 4 is a guest in this channel.
insert into app.channel_guest_grants(channel_id,family_id,user_id,email) values(pg_temp.c(),pg_temp.f(),pg_temp.u(4),'chat-action-4@example.test');
insert into app.channel_participants(channel_id,family_id,user_id) values(pg_temp.c(),pg_temp.f(),pg_temp.u(4));
set local role famsync_api;
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'Original secret',null,'{}');
select pg_temp.act(2);
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(2),'Answer',pg_temp.m(1),'{}');
-- Edit: author only, conflict checked, replies marked.
select pg_temp.reject($q$select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),0,'Stolen','{}')$q$,'42501');
select pg_temp.act(1);
select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),0,'Edited secret',array[pg_temp.u(2)]);
select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),0,'Edited secret',array[pg_temp.u(2)]);
select pg_temp.expect((select edit_count=1 and edited_at is not null from app.channel_messages where id=pg_temp.m(1)),'a repeated edit counts once');
select pg_temp.expect((select change_seq>2 from app.channel_messages where id=pg_temp.m(2)),'a reply is refreshed when its original changes');
select pg_temp.reject($q$select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),0,'Other tab','{}')$q$,'40001');
select pg_temp.reject($q$select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),1,'  ','{}')$q$,'22023');
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'Original secret',null,'{}');
select pg_temp.expect((select body='Edited secret' from app.channel_messages where id=pg_temp.m(1)),'a late send retry does not undo an edit');
select pg_temp.reject($q$select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(9),' ',null,'{}')$q$,'22023');
select pg_temp.reject($q$select app.post_message_with_files(pg_temp.f(),pg_temp.c(),pg_temp.m(9),'',null,'{}','{}')$q$,'22023');
select pg_temp.reject($q$select app.write_message(pg_temp.f(),pg_temp.c(),pg_temp.m(9),'',null,'{}')$q$,'42501');
-- Reactions: one per person.
select app.react_channel_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'🎂',true);
select app.react_channel_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'🐶',true);
select pg_temp.expect((select array_agg(emoji)=array['🐶'] from app.channel_reactions where message_id=pg_temp.m(1)),'a new reaction replaces the old one');
select pg_temp.reject($q$select app.react_channel_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'<b>',true)$q$,'23514');
-- Pins and stars.
select app.pin_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),true);
select pg_temp.act(4);
select pg_temp.reject($q$select app.pin_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),false)$q$,'42501');
select app.star_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),true);
select pg_temp.act(2);
select app.star_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),true);
select pg_temp.expect((select count(*)=1 from app.message_stars),'stars are private to their owner');
select app.set_conversation_preferences(pg_temp.f(),pg_temp.c(),true,null,true);
select pg_temp.expect((select count(*)=1 from app.channel_participants where pinned_at is not null and user_id=pg_temp.u(2)),'a list pin is personal');
select pg_temp.expect((select marked_unread from app.channel_participants where user_id=pg_temp.u(2)),'marked unread');
select app.read_channel(pg_temp.f(),pg_temp.c(),2);
select pg_temp.expect((select not marked_unread from app.channel_participants where user_id=pg_temp.u(2)),'reading clears the mark');
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(3),'Third',null,'{}');
select app.pin_message(pg_temp.f(),pg_temp.c(),pg_temp.m(2),true);
select app.pin_message(pg_temp.f(),pg_temp.c(),pg_temp.m(3),true);
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(4),'Fourth',null,'{}');
select pg_temp.reject($q$select app.pin_message(pg_temp.f(),pg_temp.c(),pg_temp.m(4),true)$q$,'22023');
-- Delete: author only; content and references go.
select pg_temp.reject($q$select app.delete_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1))$q$,'42501');
reset role;
insert into app.conversation_alerts(family_id,message_id,recipient_id,kind) values(pg_temp.f(),pg_temp.m(1),pg_temp.u(2),'mention');
set local role famsync_api;
select pg_temp.act(1);
select app.delete_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1));
select app.delete_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1));
select pg_temp.expect((select body='' and deleted_at is not null and mentioned_user_ids='{}' from app.channel_messages where id=pg_temp.m(1)),'deleted text is gone');
select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'Original secret',null,'{}');
select pg_temp.expect((select body='' from app.channel_messages where id=pg_temp.m(1)),'a late retry does not restore it');
select pg_temp.reject($q$select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),1,'Back','{}')$q$,'22023');
select pg_temp.reject($q$select app.react_channel_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),'👍',true)$q$,'22023');
select pg_temp.reject($q$select app.star_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),true)$q$,'22023');
select pg_temp.reject($q$select app.pin_message(pg_temp.f(),pg_temp.c(),pg_temp.m(1),true)$q$,'22023');
select pg_temp.reject($q$select app.post_conversation_message(pg_temp.f(),pg_temp.c(),pg_temp.m(8),'Reply',pg_temp.m(1),'{}')$q$,'22023');
reset role;
select pg_temp.expect(not exists(select 1 from app.conversation_alerts where message_id=pg_temp.m(1)) and not exists(select 1 from app.message_stars where message_id=pg_temp.m(1)) and not exists(select 1 from app.message_pins where message_id=pg_temp.m(1)) and not exists(select 1 from app.channel_reactions where message_id=pg_temp.m(1)),'alerts, stars, pins and reactions are removed');
set local role famsync_jobs;
select app.deliver_conversation_notice('ca000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.expect(not exists(select 1 from app.conversation_alerts where message_id=pg_temp.m(1)),'a queued notice does not announce a deleted message');
-- Time windows.
update app.channel_messages set created_at=clock_timestamp()-interval '16 minutes' where id=pg_temp.m(2);
update app.channel_messages set created_at=clock_timestamp()-interval '49 hours' where id=pg_temp.m(3);
set local role famsync_api;
select pg_temp.act(2);
select pg_temp.reject($q$select app.edit_message(pg_temp.f(),pg_temp.c(),pg_temp.m(2),0,'Late','{}')$q$,'22023');
select app.delete_message(pg_temp.f(),pg_temp.c(),pg_temp.m(2));
select pg_temp.reject($q$select app.delete_message(pg_temp.f(),pg_temp.c(),pg_temp.m(3))$q$,'22023');
-- Admins.
select pg_temp.reject($q$select app.set_channel_admin(pg_temp.f(),pg_temp.c(),1,pg_temp.u(2),true)$q$,'42501');
select pg_temp.act(1);
select pg_temp.reject($q$select app.leave_channel(pg_temp.f(),pg_temp.c())$q$,'22023');
select pg_temp.reject($q$select app.set_channel_admin(pg_temp.f(),pg_temp.c(),1,pg_temp.u(4),true)$q$,'22023');
select pg_temp.reject($q$select app.set_channel_admin(pg_temp.f(),pg_temp.c(),1,pg_temp.u(1),false)$q$,'22023');
select app.set_channel_admin(pg_temp.f(),pg_temp.c(),1,pg_temp.u(2),true);
select pg_temp.act(2);
select pg_temp.reject($q$select app.hand_over_channel(pg_temp.f(),pg_temp.c(),2,pg_temp.u(3))$q$,'42501');
select pg_temp.reject($q$select app.change_channel(pg_temp.f(),pg_temp.c(),2,'details','{"name":"Coup","emoji":"💬","topic":"","description":"","memberIds":["aa000000-0000-4000-8000-000000000002"]}')$q$,'22023');
select app.change_channel(pg_temp.f(),pg_temp.c(),2,'details','{"name":"Renamed","emoji":"💬","topic":"","description":"","memberIds":["aa000000-0000-4000-8000-000000000001","aa000000-0000-4000-8000-000000000002","aa000000-0000-4000-8000-000000000003"]}');
select pg_temp.act(1);
select app.leave_channel(pg_temp.f(),pg_temp.c());
select pg_temp.expect((select count(*)=0 from app.channel_messages),'leaving ends history access');
select pg_temp.act(2);
select pg_temp.expect((select manager_id=pg_temp.u(2) from app.channels),'the remaining admin becomes manager');
select app.hand_over_channel(pg_temp.f(),pg_temp.c(),(select version from app.channels),pg_temp.u(3));
select pg_temp.expect((select manager_id=pg_temp.u(3) from app.channels) and app.is_channel_admin(pg_temp.c(),pg_temp.u(2)),'handover keeps the old manager as admin');
-- Guests may upload and leave, never administer.
select pg_temp.act(4);
select pg_temp.expect((select count(*)=1 from app.chat_upload_folder(pg_temp.f(),pg_temp.c(),gen_random_uuid())),'a guest can send a file');
select pg_temp.expect((select count(*)=1 from app.chat_upload_folder(pg_temp.f(),pg_temp.c(),gen_random_uuid()) x join app.folders d on d.id=x.id where d.chat_uploads),'and it uses one shared folder');
select pg_temp.expect(not app.folder_can_manage((select id from app.folders)),'a guest cannot manage the folder');
select app.leave_channel(pg_temp.f(),pg_temp.c());
select pg_temp.expect((select count(*)=0 from app.channels) and (select count(*)=0 from app.folders),'a guest who leaves loses access');
select pg_temp.reject($q$select * from app.chat_upload_folder(pg_temp.f(),pg_temp.c(),gen_random_uuid())$q$,'P0002');
reset role;
select pg_temp.expect((select revoked_at is not null from app.channel_guest_grants where channel_id=pg_temp.c()),'and the grant is revoked');
delete from app.families where id=pg_temp.f();
rollback;
