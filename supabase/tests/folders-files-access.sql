\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aa000000-0000-4000-8000-000000000001','files-owner@example.test',now()),('aa000000-0000-4000-8000-000000000002','files-member@example.test',now()),
 ('aa000000-0000-4000-8000-000000000003','files-excluded@example.test',now()),('aa000000-0000-4000-8000-000000000004','files-guest@example.test',now());
insert into app.families(id,name,channel_guests_allowed) values('fa000000-0000-4000-8000-000000000001','Files fixture',true);
insert into app.family_memberships(family_id,user_id,role) values
 ('fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','owner'),
 ('fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','member'),
 ('fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003','member');
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED %',label;end if;end $$;
create function pg_temp.reject(sql text,expected text) returns void language plpgsql as $$begin execute sql;raise exception 'Expected rejection';exception when others then if sqlstate<>expected then raise exception 'Expected %, received % (%)',expected,sqlstate,sqlerrm;end if;end $$;
create function pg_temp.act(n integer) returns void language sql as $$select set_config('app.actor_id','aa000000-0000-4000-8000-'||lpad(n::text,12,'0'),true) $$;
create function pg_temp.reserve(n integer,d integer,v integer default 1) returns jsonb language sql as $$
 select app.reserve_stored_file('fa000000-0000-4000-8000-000000000001',('ea000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('da000000-0000-4000-8000-'||lpad(d::text,12,'0'))::uuid,null,v,'readme.txt','text/plain',5,repeat('a',64)) $$;
create function pg_temp.finish(n integer) returns void language sql as $$select app.finalize_stored_file('fa000000-0000-4000-8000-000000000001',('ea000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid) $$;
grant execute on all functions in schema pg_temp to famsync_api,famsync_jobs;
set local role famsync_api;
select pg_temp.act(1);
select app.create_channel('fa000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','{"name":"Files conversation","emoji":"💬","topic":"","description":"","memberIds":["aa000000-0000-4000-8000-000000000001","aa000000-0000-4000-8000-000000000002"]}');
select app.create_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001',null,null,'Selected folder','selected',array['aa000000-0000-4000-8000-000000000002']::uuid[]);
select app.create_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001',null,null,'Selected folder','selected',array['aa000000-0000-4000-8000-000000000002']::uuid[]);
select app.create_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000003','ba000000-0000-4000-8000-000000000001',1,'Conversation folder','family','{}');
select app.create_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000004',null,null,'Pending folder','private','{}');
select pg_temp.reserve(1,1);select pg_temp.expect((select count(*)=0 from app.stored_files),'pending uploads are hidden');select pg_temp.finish(1);
select pg_temp.expect((pg_temp.reserve(1,1)->>'state')='ready','same upload ID acknowledges saved file');
select pg_temp.reject($q$select app.reserve_stored_file('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000001',null,1,'different.txt','text/plain',5,repeat('a',64))$q$,'23505');
select pg_temp.reject('select object_key from app.stored_files','42501');
select pg_temp.act(2);
select pg_temp.expect((select count(*)=1 from app.stored_files),'selected member reads shared file');
select pg_temp.expect((select count(*)=1 from app.stored_file_grant('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001')),'selected member gets a download grant');
select pg_temp.reject($q$select app.archive_stored_file('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001',1,true)$q$,'42501');
select app.create_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002',null,null,'Member private','private','{}');
select pg_temp.act(1);
select pg_temp.expect(not app.folder_can_read('da000000-0000-4000-8000-000000000002'),'family owner cannot read another private folder');
select pg_temp.reserve(2,3);select pg_temp.finish(2);
select app.post_message_with_files('fa000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','Shared file',null,'{}',array['ea000000-0000-4000-8000-000000000002']::uuid[]);
select app.post_message_with_files('fa000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','Shared file',null,'{}',array['ea000000-0000-4000-8000-000000000002']::uuid[]);
select pg_temp.expect((select last_position=1 from app.channels where id='ba000000-0000-4000-8000-000000000001'),'attachment retry preserves one message position');
select pg_temp.expect((select count(*)=1 from app.message_file_links),'attachment retry preserves one link');
select pg_temp.reject($q$select app.post_message_with_files('fa000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000002','Wrong folder',null,'{}',array['ea000000-0000-4000-8000-000000000001']::uuid[])$q$,'22023');
select pg_temp.expect((select count(*)=1 from app.channel_messages),'invalid attachment rolls back message and ordering');
select app.archive_stored_file('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',1,true);
select pg_temp.expect((select count(*)=0 from app.stored_file_grant('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002')),'file archive stops new grants');
select app.archive_stored_file('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002',2,false);
select app.change_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000003',1,'{"archived":true}');
select pg_temp.expect((select count(*)=0 from app.stored_file_grant('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000002')),'folder archive stops grants');
select app.change_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000003',2,'{"archived":false}');
select pg_temp.reserve(10,4);select pg_temp.reserve(11,4);select pg_temp.reserve(12,4);
select pg_temp.reject('select pg_temp.reserve(13,4)','22023');
select app.change_folder('fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000004',1,'{"name":"Renamed pending folder","audience":"private","selectedMemberIds":[]}');
select pg_temp.reject('select pg_temp.finish(11)','40001');
select pg_temp.reserve(11,4,2);select pg_temp.finish(11);
select pg_temp.act(3);select pg_temp.expect((select count(*)=0 from app.folders),'excluded member sees no folders');select pg_temp.expect((select count(*)=0 from app.stored_files),'excluded member sees no files');
reset role;
insert into app.channel_guest_grants(channel_id,family_id,user_id,email) values('ba000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000004','files-guest@example.test');
insert into app.channel_participants(channel_id,family_id,user_id) values('ba000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000004');
update app.stored_files set expires_at=clock_timestamp()-interval '1 second' where id='ea000000-0000-4000-8000-000000000010';
set local role famsync_jobs;
select pg_temp.expect(app.claim_file_cleanup('ea000000-0000-4000-8000-000000000010') is not null,'cleanup claims expired upload');
select pg_temp.expect(app.claim_file_cleanup('ea000000-0000-4000-8000-000000000010') is not null,'cleanup claim retries after a worker interruption');
select pg_temp.expect(app.claim_file_cleanup('ea000000-0000-4000-8000-000000000002') is null,'cleanup never removes ready folder files');
select app.finish_file_cleanup('ea000000-0000-4000-8000-000000000010');select pg_temp.reject('select * from app.stored_files','42501');
reset role;
insert into app.stored_files(id,family_id,folder_id,author_id,file_name,mime,byte_size,content_hash,object_key,target_version,state)
 select gen_random_uuid(),'fa000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-000000000001',
 'quota.txt','text/plain',5,repeat('a',64),'quota/'||gen_random_uuid()::text,2,'ready' from generate_series(1,98);
set local role famsync_api;
select pg_temp.act(1);select pg_temp.reject('select pg_temp.finish(10)','22023');
select pg_temp.reject('select pg_temp.reserve(13,4,2)','22023');
select app.archive_stored_file('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000011',1,true);
select pg_temp.reserve(13,4,2);
select pg_temp.reject($q$select app.archive_stored_file('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000011',2,false)$q$,'22023');
select pg_temp.act(4);select pg_temp.expect((select count(*)=1 from app.folders),'guest sees conversation folder only');
select pg_temp.reject($q$select app.create_folder('fa000000-0000-4000-8000-000000000001',gen_random_uuid(),'ba000000-0000-4000-8000-000000000001',1,'Guest created','family','{}')$q$,'42501');
select pg_temp.reserve(3,3,3);select pg_temp.finish(3);
select pg_temp.expect((select count(*)=1 from app.stored_file_grant('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000003')),'guest uploads and reads its conversation file');
select pg_temp.act(1);
select app.reserve_stored_file('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000020',null,'ba000000-0000-4000-8000-000000000001',1,'channel-image.webp','image/webp',20,repeat('b',64));
select pg_temp.finish(20);
select pg_temp.expect((select image_file_id='ea000000-0000-4000-8000-000000000020'::uuid and version=2 from app.channels where id='ba000000-0000-4000-8000-000000000001'),'image publish atomically changes channel version');
select app.remove_channel_image('fa000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001',2);
select pg_temp.expect((select count(*)=0 from app.stored_file_grant('fa000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000020')),'removed image cannot receive new grants');
select app.revoke_channel_guest('fa000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000004','grant');
select pg_temp.act(4);select pg_temp.expect((select count(*)=0 from app.folders),'guest revocation hides folders');select pg_temp.expect((select count(*)=0 from app.stored_files),'guest revocation hides file metadata');
reset role;
rollback;
