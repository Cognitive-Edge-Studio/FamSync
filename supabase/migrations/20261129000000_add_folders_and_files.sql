create table app.folders(
 id uuid primary key,family_id uuid not null references app.families(id) on delete cascade,
 channel_id uuid,author_id uuid references auth.users(id) on delete set null,
 name text not null check(char_length(btrim(name)) between 1 and 100),
 audience app.item_audience not null default 'private',selected_member_ids uuid[] not null default '{}',
 version integer not null default 1,archived_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 unique(id,family_id),foreign key(channel_id,family_id) references app.channels(id,family_id) on delete cascade,
 check(channel_id is null or (audience='family' and cardinality(selected_member_ids)=0))
);
create index folders_by_family on app.folders(family_id,created_at,id);
create index folders_by_channel on app.folders(channel_id,created_at,id);

create function app.folder_can_read(p_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.folders d where d.id=p_id and case when d.channel_id is null
  then app.can_view_family_item(d.family_id,d.author_id,d.audience,d.selected_member_ids)
  else app.is_channel_participant(d.channel_id,app.actor_id()) end)
$$;
create function app.folder_can_manage(p_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.folders d left join app.channels c on c.id=d.channel_id where d.id=p_id and app.folder_can_read(d.id)
 and (d.author_id=app.actor_id() or c.manager_id=app.actor_id()) and (c.id is null or c.archived_at is null)
 and exists(select 1 from app.family_memberships m where m.family_id=d.family_id and m.user_id=app.actor_id()))
$$;
create function app.folder_can_upload(p_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.folders d left join app.channels c on c.id=d.channel_id where d.id=p_id and d.archived_at is null
 and app.folder_can_read(d.id) and (c.id is null or c.archived_at is null))
$$;
alter table app.folders enable row level security;
grant select on app.folders to famsync_api;
create policy folders_read on app.folders for select to famsync_api using(app.folder_can_read(id));

create function app.create_folder(p_family uuid,p_id uuid,p_channel uuid,p_channel_version integer,p_name text,p_audience app.item_audience,p_selected uuid[]) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare d app.folders;c app.channels; selected uuid[]:=array(select distinct u from unnest(coalesce(p_selected,'{}')) u order by u);
begin
 perform 1 from app.families where id=p_family for share;
 if not exists(select 1 from app.family_memberships where family_id=p_family and user_id=app.actor_id()) then raise exception 'Only family members can create folders' using errcode='42501';end if;
 if p_channel is not null then
  select * into c from app.channels where id=p_channel and family_id=p_family for share;
  if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Conversation not found' using errcode='P0002';end if;
  if c.archived_at is not null then raise exception 'Restore the conversation before creating a folder' using errcode='22023';end if;
  p_audience:='family';selected:='{}';
 end if;
 select * into d from app.folders where id=p_id;
 if found then
  if d.family_id=p_family and d.author_id=app.actor_id() and d.channel_id is not distinct from p_channel and app.folder_can_read(d.id) then return;end if;
  raise exception 'Folder ID already in use' using errcode='23505';end if;
 if p_channel is not null and c.version is distinct from p_channel_version then raise exception 'Conversation changed. Reload before creating the folder.' using errcode='40001';end if;
 if p_channel is null and not app.can_set_family_item_audience(p_family,p_audience,selected) then raise exception 'Choose a valid folder audience' using errcode='22023';end if;
 insert into app.folders(id,family_id,channel_id,author_id,name,audience,selected_member_ids) values(p_id,p_family,p_channel,app.actor_id(),btrim(p_name),p_audience,selected);
 if p_channel is not null then perform app.queue_channel_refresh(p_channel);end if;
end $$;
create function app.change_folder(p_family uuid,p_id uuid,p_version integer,p_data jsonb) returns void
 language plpgsql security definer set search_path=pg_catalog as $$
declare d app.folders;selected uuid[];a app.item_audience;
begin
 perform 1 from app.families where id=p_family for share;
 select * into d from app.folders where id=p_id and family_id=p_family;
 if d.channel_id is not null then perform 1 from app.channels where id=d.channel_id for share;end if;
 select * into d from app.folders where id=p_id and family_id=p_family for update;
 if d.id is null or not app.folder_can_read(p_id) then raise exception 'Folder not found' using errcode='P0002';end if;
 if not app.folder_can_manage(p_id) then raise exception 'Only the folder creator or channel manager can change this folder' using errcode='42501';end if;
 if d.version<>p_version then raise exception 'Folder changed. Reload before saving.' using errcode='40001';end if;
 if p_data ? 'archived' then
  update app.folders set archived_at=case when (p_data->>'archived')::boolean then coalesce(archived_at,clock_timestamp()) end,version=version+1 where id=p_id;
 else
  if d.archived_at is not null then raise exception 'Restore the folder before editing' using errcode='22023';end if;
  a:=case when d.channel_id is null then (p_data->>'audience')::app.item_audience else 'family' end;
  selected:=case when d.channel_id is null then array(select distinct jsonb_array_elements_text(p_data->'selectedMemberIds')::uuid order by 1) else '{}'::uuid[] end;
  if d.channel_id is null and not app.can_set_family_item_audience(p_family,a,selected) then raise exception 'Choose a valid folder audience' using errcode='22023';end if;
  update app.folders set name=btrim(p_data->>'name'),audience=a,selected_member_ids=selected,version=version+1 where id=p_id;
 end if;
 if d.channel_id is not null then perform app.queue_channel_refresh(d.channel_id);end if;
end $$;

create table app.stored_files(
 id uuid primary key,family_id uuid not null references app.families(id) on delete cascade,folder_id uuid,image_channel_id uuid,
 author_id uuid references auth.users(id) on delete set null,
 file_name text not null check(char_length(file_name) between 1 and 180),mime text not null check(mime in('application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv')),
 byte_size integer not null check(byte_size between 1 and 5242880),content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 object_key text not null unique,state text not null default 'uploading' check(state in('uploading','ready','discarding','failed')),
 target_version integer not null,expires_at timestamptz not null default(clock_timestamp()+interval '30 minutes'),
 version integer not null default 1,archived_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 foreign key(folder_id,family_id) references app.folders(id,family_id) on delete cascade,
 foreign key(image_channel_id,family_id) references app.channels(id,family_id) on delete cascade,
 check((folder_id is not null)::integer+(image_channel_id is not null)::integer=1),
 check(image_channel_id is null or (mime='image/webp' and byte_size<=2097152))
);
create index stored_files_by_folder on app.stored_files(folder_id,created_at,id);
create index stored_files_by_image on app.stored_files(image_channel_id,created_at,id);
alter table app.channels add column image_file_id uuid references app.stored_files(id);

create function app.file_can_read(p_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.stored_files f where f.id=p_id and f.state='ready' and
  (case when f.folder_id is not null then app.folder_can_read(f.folder_id) else exists(select 1 from app.channels c where c.id=f.image_channel_id and c.image_file_id=f.id and app.is_channel_participant(c.id,app.actor_id())) end))
$$;
create function app.file_can_manage(p_id uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from app.stored_files f where f.id=p_id and f.folder_id is not null and app.file_can_read(f.id)
 and app.folder_can_upload(f.folder_id) and (f.author_id=app.actor_id() or app.folder_can_manage(f.folder_id)))
$$;
alter table app.stored_files enable row level security;
-- Private object keys, hashes and pending reservations stay behind narrow functions.
grant select(id,family_id,folder_id,image_channel_id,author_id,file_name,mime,byte_size,state,version,archived_at,created_at) on app.stored_files to famsync_api;
create policy stored_files_read on app.stored_files for select to famsync_api using(app.file_can_read(id));

create function app.queue_file_cleanup(p_id uuid,p_at timestamptz) returns void language sql security definer set search_path=pg_catalog as $$
 insert into app.outbox(kind,family_id,payload,dedupe_key,available_at) select 'storage.cleanup',family_id,jsonb_build_object('fileId',id),'storage-cleanup:'||gen_random_uuid()::text,p_at from app.stored_files where id=p_id
$$;

create function app.reserve_stored_file(p_family uuid,p_id uuid,p_folder uuid,p_image uuid,p_version integer,p_name text,p_mime text,p_bytes integer,p_hash text) returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $$
declare d app.folders;c app.channels;r app.stored_files;target_version integer;
begin
 perform 1 from app.families where id=p_family for share;
 if (p_folder is null)=(p_image is null) then raise exception 'Choose one upload destination' using errcode='22023';end if;
 if p_folder is not null then
  select * into d from app.folders where id=p_folder and family_id=p_family;
  if d.channel_id is not null then perform 1 from app.channels where id=d.channel_id for share;end if;
  select * into d from app.folders where id=p_folder and family_id=p_family for update;
  if d.id is null or not app.folder_can_read(d.id) then raise exception 'Folder not found' using errcode='P0002';end if;
  target_version:=d.version;
 else
  select * into c from app.channels where id=p_image and family_id=p_family for update;
  if c.id is null or c.kind<>'channel' or c.manager_id is distinct from app.actor_id() or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Only the channel manager can change its image' using errcode='42501';end if;
  target_version:=c.version;
 end if;
 select * into r from app.stored_files where id=p_id for update;
 if found then
  if r.family_id<>p_family or r.author_id is distinct from app.actor_id() or r.folder_id is distinct from p_folder or r.image_channel_id is distinct from p_image
   or (r.file_name,r.mime,r.byte_size,r.content_hash) is distinct from (p_name,p_mime,p_bytes,p_hash) then raise exception 'Upload ID already in use for different content' using errcode='23505';end if;
  if r.state='ready' then
   if p_image is not null and c.image_file_id is distinct from r.id then raise exception 'The channel image changed. Reload before replacing it.' using errcode='40001';end if;
   return jsonb_build_object('key',r.object_key,'state',r.state);
  end if;
  if r.state<>'uploading' or r.expires_at<=clock_timestamp() then raise exception 'This upload expired. Start a new upload attempt.' using errcode='22023';end if;
 end if;
 if target_version is distinct from p_version then raise exception 'Upload destination changed. Reload before retrying.' using errcode='40001';end if;
 if p_folder is not null and not app.folder_can_upload(d.id) or p_image is not null and c.archived_at is not null then raise exception 'Restore the destination before uploading' using errcode='22023';end if;
 if r.id is not null then
  update app.stored_files set target_version=p_version where id=p_id;
  return jsonb_build_object('key',r.object_key,'state',r.state);
 end if;
 if p_folder is not null and (select count(*) from app.stored_files where folder_id=p_folder and archived_at is null and (state='ready' or state='uploading' and expires_at>clock_timestamp()))>=100 then raise exception 'This folder has 100 active files. Archive files before uploading more.' using errcode='22023';end if;
 if (select count(*) from app.stored_files where folder_id is not distinct from p_folder and image_channel_id is not distinct from p_image and author_id=app.actor_id() and state='uploading' and expires_at>clock_timestamp())>=3 then raise exception 'Three uploads are already pending here. Retry them or wait for their expiry.' using errcode='22023';end if;
 insert into app.stored_files(id,family_id,folder_id,image_channel_id,author_id,file_name,mime,byte_size,content_hash,object_key,target_version)
 values(p_id,p_family,p_folder,p_image,app.actor_id(),p_name,p_mime,p_bytes,p_hash,p_family::text||'/files/'||p_id::text||'/'||gen_random_uuid()::text,p_version) returning * into r;
 perform app.queue_file_cleanup(r.id,r.expires_at+interval '1 minute');
 return jsonb_build_object('key',r.object_key,'state',r.state);
end $$;

create function app.finalize_stored_file(p_family uuid,p_id uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare r app.stored_files;d app.folders;c app.channels;old_image uuid;
begin
 select * into r from app.stored_files where id=p_id and family_id=p_family;
 if r.id is null or r.author_id is distinct from app.actor_id() then raise exception 'Upload not found' using errcode='P0002';end if;
 perform 1 from app.families where id=p_family for share;
 if r.folder_id is not null then
  select * into d from app.folders where id=r.folder_id;
  if d.channel_id is not null then perform 1 from app.channels where id=d.channel_id for share;end if;
  select * into d from app.folders where id=r.folder_id for update;
  if not app.folder_can_read(d.id) then raise exception 'Folder not found' using errcode='P0002';end if;
 else
  select * into c from app.channels where id=r.image_channel_id for update;
  if c.manager_id is distinct from app.actor_id() or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Image access changed' using errcode='42501';end if;
 end if;
 select * into r from app.stored_files where id=p_id for update;
 if r.state='ready' then
  if r.image_channel_id is not null and c.image_file_id is distinct from r.id then raise exception 'The channel image changed' using errcode='40001';end if;
  return;
 end if;
 if r.state<>'uploading' or r.expires_at<=clock_timestamp() then raise exception 'This upload expired. Start a new upload attempt.' using errcode='22023';end if;
 if r.folder_id is not null then
  if not app.folder_can_upload(d.id) or d.version<>r.target_version then raise exception 'Folder access or audience changed. Reload before retrying.' using errcode='40001';end if;
 else
  if c.version<>r.target_version or c.archived_at is not null then raise exception 'Channel changed. Reload before retrying.' using errcode='40001';end if;
  old_image:=c.image_file_id;
  update app.channels set image_file_id=r.id,version=version+1 where id=c.id;
  if old_image is not null then
   update app.stored_files set archived_at=clock_timestamp(),version=version+1 where id=old_image;
   perform app.queue_file_cleanup(old_image,clock_timestamp()+interval '31 minutes');
  end if;
 end if;
 update app.stored_files set state='ready' where id=p_id;
 if coalesce(d.channel_id,c.id) is not null then perform app.queue_channel_refresh(coalesce(d.channel_id,c.id));end if;
end $$;

create function app.archive_stored_file(p_family uuid,p_id uuid,p_version integer,p_archived boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare r app.stored_files;d app.folders;
begin
 perform 1 from app.families where id=p_family for share;
 select * into r from app.stored_files where id=p_id and family_id=p_family;
 select * into d from app.folders where id=r.folder_id;
 if d.channel_id is not null then perform 1 from app.channels where id=d.channel_id for share;end if;
 perform 1 from app.folders where id=d.id for update;
 select * into r from app.stored_files where id=p_id and family_id=p_family for update;
 if r.id is null or not app.file_can_read(r.id) then raise exception 'File not found' using errcode='P0002';end if;
 if not app.file_can_manage(r.id) then raise exception 'Only the uploader, folder creator or channel manager can manage this file' using errcode='42501';end if;
 if (r.archived_at is not null)=p_archived then return;end if;
 if r.version<>p_version then raise exception 'File changed. Reload before trying again.' using errcode='40001';end if;
 if not p_archived and (select count(*) from app.stored_files where folder_id=d.id and archived_at is null and (state='ready' or state='uploading' and expires_at>clock_timestamp()))>=100 then raise exception 'Archive another file before restoring this file' using errcode='22023';end if;
 update app.stored_files set archived_at=case when p_archived then clock_timestamp() end,version=version+1 where id=p_id;
 if d.channel_id is not null then perform app.queue_channel_refresh(d.channel_id);end if;
end $$;

create function app.stored_file_grant(p_family uuid,p_id uuid) returns table(object_key text,file_name text,mime text,byte_size integer)
 language sql stable security definer set search_path=pg_catalog as $$
 select f.object_key,f.file_name,f.mime,f.byte_size from app.stored_files f left join app.folders d on d.id=f.folder_id
 where f.id=p_id and f.family_id=p_family and app.file_can_read(f.id) and f.archived_at is null and (d.id is null or d.archived_at is null)
$$;
create function app.remove_channel_image(p_family uuid,p_channel uuid,p_version integer) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or c.kind<>'channel' or c.manager_id is distinct from app.actor_id() or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Only the channel manager can change its image' using errcode='42501';end if;
 if c.image_file_id is null then return;end if;
 if c.version<>p_version then raise exception 'Channel changed. Reload before removing its image.' using errcode='40001';end if;
 if c.archived_at is not null then raise exception 'Restore the channel before changing its image' using errcode='22023';end if;
 update app.stored_files set archived_at=clock_timestamp(),version=version+1 where id=c.image_file_id;
 update app.channels set image_file_id=null,version=version+1 where id=c.id;
 perform app.queue_file_cleanup(c.image_file_id,clock_timestamp()+interval '31 minutes');
 perform app.queue_channel_refresh(c.id);
end $$;

create function app.claim_file_cleanup(p_id uuid) returns text language plpgsql security definer set search_path=pg_catalog as $$
declare r app.stored_files;
begin
 select * into r from app.stored_files where id=p_id for update;
 if r.state='discarding' then return r.object_key;end if;
 if r.state='uploading' and r.expires_at<=clock_timestamp() or r.state='ready' and r.image_channel_id is not null
  and r.archived_at<clock_timestamp()-interval '30 minutes' and not exists(select 1 from app.channels where image_file_id=r.id) then
  update app.stored_files set state='discarding' where id=r.id;return r.object_key;
 end if;
 return null;
end $$;
create function app.finish_file_cleanup(p_id uuid) returns void language sql security definer set search_path=pg_catalog as $$
 update app.stored_files set state='failed' where id=p_id and state='discarding'
$$;

create table app.message_file_links(
 id uuid primary key default gen_random_uuid(),message_id uuid not null references app.channel_messages(id) on delete cascade,
 file_id uuid not null references app.stored_files(id) on delete cascade,author_id uuid references auth.users(id) on delete set null,
 unique(message_id,file_id)
);
alter table app.message_file_links enable row level security;
grant select on app.message_file_links to famsync_api;
create policy message_file_links_read on app.message_file_links for select to famsync_api using(exists(select 1 from app.channel_messages m where m.id=message_id));
create function app.link_message_file(p_family uuid,p_channel uuid,p_message uuid,p_file uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) or not exists(select 1 from app.channel_messages where id=p_message and channel_id=c.id) then raise exception 'Message not found' using errcode='P0002';end if;
 if c.archived_at is not null then raise exception 'Restore the conversation before attaching files' using errcode='22023';end if;
 if not exists(select 1 from app.stored_files f join app.folders d on d.id=f.folder_id where f.id=p_file and d.channel_id=c.id and f.state='ready' and f.archived_at is null and d.archived_at is null and app.file_can_read(f.id)) then raise exception 'Choose a ready file from this conversation’s folders' using errcode='22023';end if;
 if exists(select 1 from app.message_file_links where message_id=p_message and file_id=p_file) then return;end if;
 if (select count(*) from app.message_file_links where message_id=p_message)>=5 then raise exception 'A message can have up to five files' using errcode='22023';end if;
 insert into app.message_file_links(message_id,file_id,author_id) values(p_message,p_file,app.actor_id());
 perform app.queue_channel_refresh(c.id);
end $$;
create function app.unlink_message_file(p_family uuid,p_channel uuid,p_message uuid,p_link uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c app.channels;l app.message_file_links;
begin
 perform 1 from app.families where id=p_family for share;
 select * into c from app.channels where id=p_channel and family_id=p_family for update;
 if c.id is null or not app.is_channel_participant(c.id,app.actor_id()) then raise exception 'Message not found' using errcode='P0002';end if;
 select * into l from app.message_file_links where id=p_link and message_id=p_message;
 if not found then return;end if;
 if l.author_id is distinct from app.actor_id() and c.manager_id is distinct from app.actor_id() then raise exception 'Only the person who attached the file or channel manager can unlink it' using errcode='42501';end if;
 delete from app.message_file_links where id=l.id;perform app.queue_channel_refresh(c.id);
end $$;
alter table app.channel_messages add column original_file_ids uuid[] not null default '{}';
create function app.post_message_with_files(p_family uuid,p_channel uuid,p_id uuid,p_body text,p_reply uuid,p_mentions uuid[],p_files uuid[]) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare ids uuid[]:=array(select distinct u from unnest(coalesce(p_files,'{}')) u order by u);m app.channel_messages;fid uuid;
begin
 perform 1 from app.families where id=p_family for share;
 perform 1 from app.channels where id=p_channel and family_id=p_family for update;
 if not found or not app.is_channel_participant(p_channel,app.actor_id()) then raise exception 'Conversation not found' using errcode='P0002';end if;
 if cardinality(ids)>5 then raise exception 'Attach up to five files' using errcode='22023';end if;
 select * into m from app.channel_messages where id=p_id;
 if found and m.original_file_ids is distinct from ids then raise exception 'Message ID already in use for different attachments' using errcode='23505';end if;
 perform app.post_conversation_message(p_family,p_channel,p_id,p_body,p_reply,p_mentions);
 if m.id is null then
  update app.channel_messages set original_file_ids=ids where id=p_id;
  foreach fid in array ids loop perform app.link_message_file(p_family,p_channel,p_id,fid);end loop;
 end if;
end $$;

do $$ declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app' and p.proname=any(array[
 'folder_can_read','folder_can_manage','folder_can_upload','create_folder','change_folder','file_can_read','file_can_manage','queue_file_cleanup',
 'reserve_stored_file','finalize_stored_file','archive_stored_file','stored_file_grant','remove_channel_image','claim_file_cleanup','finish_file_cleanup','link_message_file','unlink_message_file','post_message_with_files']) loop
 execute format('revoke all on function %s from public',fn);end loop;
end $$;
grant execute on function app.folder_can_read(uuid),app.folder_can_manage(uuid),app.folder_can_upload(uuid),app.create_folder(uuid,uuid,uuid,integer,text,app.item_audience,uuid[]),
 app.change_folder(uuid,uuid,integer,jsonb),app.file_can_read(uuid),app.file_can_manage(uuid),app.reserve_stored_file(uuid,uuid,uuid,uuid,integer,text,text,integer,text),
 app.finalize_stored_file(uuid,uuid),app.archive_stored_file(uuid,uuid,integer,boolean),app.stored_file_grant(uuid,uuid),app.remove_channel_image(uuid,uuid,integer),
 app.link_message_file(uuid,uuid,uuid,uuid),app.unlink_message_file(uuid,uuid,uuid,uuid),app.post_message_with_files(uuid,uuid,uuid,text,uuid,uuid[],uuid[]) to famsync_api;
grant execute on function app.claim_file_cleanup(uuid),app.finish_file_cleanup(uuid) to famsync_jobs;
