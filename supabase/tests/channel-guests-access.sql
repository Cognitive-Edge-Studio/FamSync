\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('a9000000-0000-4000-8000-000000000001','guest-owner@example.test',now()),
 ('a9000000-0000-4000-8000-000000000002','guest-manager@example.test',now()),
 ('a9000000-0000-4000-8000-000000000003','guest-person@example.test',now()),
 ('a9000000-0000-4000-8000-000000000004','guest-wrong@example.test',now());
insert into app.families(id,name) values('f9000000-0000-4000-8000-000000000001','Guest fixture');
insert into app.family_memberships(family_id,user_id,role) values
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','owner'),
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$begin execute sql;raise exception 'Expected rejection';exception when others then if sqlstate<>expected then raise exception 'Expected %, received % (%)',expected,sqlstate,sqlerrm;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$select set_config('app.actor_id','a9000000-0000-4000-8000-'||lpad(n::text,12,'0'),true) $$;
grant execute on all functions in schema pg_temp to famsync_api,famsync_jobs,authenticated;
set local role famsync_api;
select pg_temp.act(2);
select app.create_channel('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','{"name":"Guest channel","emoji":"💬","topic":"","description":"","memberIds":["a9000000-0000-4000-8000-000000000002"]}');
select pg_temp.reject($q$select app.invite_channel_guest('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','guest-person@example.test',repeat('a',64),gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select app.set_channel_guest_policy('f9000000-0000-4000-8000-000000000001',true,1)$q$,'42501');
select pg_temp.act(1);
select app.set_channel_guest_policy('f9000000-0000-4000-8000-000000000001',true,1);
select pg_temp.expect((select count(*)=0 from app.channels),'owner gains no channel history access');
select pg_temp.act(2);
select app.invite_channel_guest('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','guest-person@example.test',repeat('a',64),'d9000000-0000-4000-8000-000000000001');
select app.resend_channel_guest('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001',repeat('b',64),'d9000000-0000-4000-8000-000000000002');
select pg_temp.act(4);
select pg_temp.expect((select count(*)=0 from app.accept_channel_guest(repeat('b',64))),'wrong email cannot accept');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.accept_channel_guest(repeat('a',64))),'resend invalidates old token');
reset role;
update auth.users set email_confirmed_at=null where id='a9000000-0000-4000-8000-000000000003';
set local role famsync_api;
select pg_temp.expect((select count(*)=0 from app.accept_channel_guest(repeat('b',64))),'unverified recipient cannot accept');
reset role;
update auth.users set email_confirmed_at=clock_timestamp() where id='a9000000-0000-4000-8000-000000000003';
set local role famsync_api;
select pg_temp.expect((select count(*)=1 from app.accept_channel_guest(repeat('b',64))),'verified recipient accepts');
select pg_temp.expect((select count(*)=1 from app.accept_channel_guest(repeat('b',64))),'acceptance retry acknowledges one active grant');
select pg_temp.expect((select count(*)=1 from app.channels),'guest sees only granted channel');
select pg_temp.expect((select count(*)=0 from app.families),'guest gains no family record');
select pg_temp.expect((select count(*)=0 from app.family_memberships),'guest gains no directory');
select pg_temp.expect((select count(*)=1 from app.guest_workspaces()),'guest workspace lists grant');
select pg_temp.expect((select count(*)=2 from app.conversation_context('f9000000-0000-4000-8000-000000000001')),'guest names include participants only, excluding family owner');
select pg_temp.expect((select count(*)=0 from app.channel_guest_invitations),'guest cannot inspect invitation administration');
select pg_temp.reject($q$select app.set_channel_guest_policy('f9000000-0000-4000-8000-000000000001',false,2)$q$,'42501');
select app.post_conversation_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001','Guest post',null,array['a9000000-0000-4000-8000-000000000002']::uuid[]);
select app.react_channel_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000001','👍',true);
select pg_temp.act(2);
select app.change_channel('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001',2,'details','{"name":"Guest channel edited","emoji":"💬","topic":"","description":"","memberIds":["a9000000-0000-4000-8000-000000000002"]}');
select pg_temp.expect((select count(*)=2 from app.channel_participants),'member edits preserve guest grant participation');
select app.post_conversation_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-000000000002','Guest mention',null,array['a9000000-0000-4000-8000-000000000003']::uuid[]);
reset role;
set local role famsync_jobs;
select app.deliver_conversation_notice('e9000000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*)=0 from app.guest_invitation_for_delivery('c9000000-0000-4000-8000-000000000001','d9000000-0000-4000-8000-000000000001')),'stale delivery attempt skips email');
select pg_temp.expect((select count(*)=2 from app.channel_signal_recipients('b9000000-0000-4000-8000-000000000001')),'signals include active guest');
select pg_temp.reject($q$select * from app.channel_guest_invitations$q$,'42501');
reset role;
set local role famsync_api;
select pg_temp.act(1);
select pg_temp.expect((select count(*)=1 from app.channel_guest_grants),'owner can audit guest grant without content');
select app.revoke_channel_guest('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000003','grant');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.channels),'revoked guest loses history');
select pg_temp.expect((select count(*)=0 from app.accept_channel_guest(repeat('b',64))),'accepted token cannot revive revoked grant');
select pg_temp.reject($q$select app.post_channel_message('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001',gen_random_uuid(),'Denied',null)$q$,'P0002');
select pg_temp.act(2);
select app.invite_channel_guest('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000002','guest-person@example.test',repeat('c',64),'d9000000-0000-4000-8000-000000000003');
select pg_temp.act(3);
select * from app.accept_channel_guest(repeat('c',64));
select pg_temp.act(1);
select app.set_channel_guest_policy('f9000000-0000-4000-8000-000000000001',false,2);
select app.set_channel_guest_policy('f9000000-0000-4000-8000-000000000001',true,3);
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.guest_workspaces()),'policy disable then re-enable does not restore grants');
select pg_temp.expect((select count(*)=0 from app.accept_channel_guest(repeat('c',64))),'old accepted token remains revoked after policy cycle');
select pg_temp.act(2);
select app.invite_channel_guest('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000003','guest-person@example.test',repeat('d',64),'d9000000-0000-4000-8000-000000000004');
select app.invite_channel_guest('f9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000004','guest-wrong@example.test',repeat('e',64),'d9000000-0000-4000-8000-000000000005');
select pg_temp.act(3);
select * from app.accept_channel_guest(repeat('d',64));
reset role;
insert into app.family_memberships(family_id,user_id,role) values
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000003','member'),
 ('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000004','member');
set local role famsync_api;
select pg_temp.act(1);
select app.remove_family_member('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000003');
select app.remove_family_member('f9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000004');
select pg_temp.act(3);
select pg_temp.expect((select count(*)=0 from app.channels),'family departure clears an earlier guest fallback');
select pg_temp.expect((select count(*)=0 from app.accept_channel_guest(repeat('d',64))),'departure prevents old accepted guest token');
select pg_temp.act(4);
select pg_temp.expect((select count(*)=0 from app.accept_channel_guest(repeat('e',64))),'departure revokes pending guest fallback invitation');
reset role;
rollback;
