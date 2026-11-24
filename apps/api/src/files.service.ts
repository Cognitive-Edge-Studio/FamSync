import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';import {z} from 'zod';
import {DatabaseService} from './database.service.js';import {JobsService} from './jobs.service.js';import {AttachmentStorageService} from './attachment-storage.service.js';
import {validateStoredFile,type IncomingFile} from './file-validation.js';
import {folderCreateInput,folderEditInput,folderListInput,fileListInput,type FolderDto,type FolderPageDto,type StoredFileDto,type FilePageDto,type FilePreviewDto} from './files.dto.js';
const folderFields=`d.id,d.family_id as "familyId",d.channel_id as "channelId",c.name as "channelName",d.name,d.audience,d.selected_member_ids as "selectedMemberIds",d.version,d.archived_at is not null as archived,d.created_at as "createdAt",app.folder_can_manage(d.id) as "canManage",app.folder_can_upload(d.id) as "canUpload",(select count(*)::int from app.stored_files sf where sf.folder_id=d.id and sf.state='ready' and sf.archived_at is null) as "fileCount"`;
const fileFields=`f.id,f.folder_id as "folderId",f.file_name as "fileName",f.mime,f.byte_size as "byteSize",f.version,f.archived_at is not null as archived,f.created_at as "createdAt",app.file_can_manage(f.id) as "canManage",f.archived_at is null and (d.id is null or d.archived_at is null) as "canDownload",case when f.mime like 'image/%' then 'image' when f.mime like 'text/%' then 'text' when f.mime like 'audio/%' then 'audio' when f.mime like 'video/%' then 'video' else 'none' end as preview,f.voice_seconds as "voiceSeconds"`;
@Injectable()
export class FilesService{
 constructor(private readonly database:DatabaseService,private readonly storage:AttachmentStorageService,private readonly jobs:JobsService){}
 private async run<T>(actor:string,work:(client:PoolClient)=>Promise<T>,write=false){try{const r=await this.database.withActor(actor,work);if(write)await this.jobs.notify();return r;}catch(e){const code=(e as{code?:string}).code;if(code==='P0002')throw new NotFoundException('Folder, file or conversation not found.');if(code==='42501')throw new ForbiddenException((e as Error).message);if(['40001','40P01','23505'].includes(code??''))throw new ConflictException(code==='23505'?'This ID is already saved with different content. Start a new attempt.':(e as Error).message);if(['22023','23514','23502','23503','22P02'].includes(code??''))throw new BadRequestException(code==='22023'?(e as Error).message:'Check the file or folder details.');throw e;}}
 private async context(client:PoolClient,family:string,channel?:string){
  const {rows:[scope]}=await client.query<{member:boolean;available:boolean}>('select exists(select 1 from app.family_memberships where family_id=$1 and user_id=app.actor_id()) as member,exists(select 1 from app.conversation_context($1) where id=app.actor_id()) as available',[family]);
  if(!scope.available)throw new NotFoundException('Workspace not found.');
  if(!channel)return{canCreate:scope.member,channelVersion:null,channelName:null};
  const {rows:[c]}=await client.query<{version:number;name:string;archived:boolean}>('select version,name,archived_at is not null as archived from app.channels where id=$1 and family_id=$2',[channel,family]);if(!c)throw new NotFoundException('Conversation not found.');return{canCreate:scope.member&&!c.archived,channelVersion:c.version,channelName:c.name};
 }
 private async folder(client:PoolClient,family:string,id:string){const {rows:[r]}=await client.query<FolderDto>(`select ${folderFields} from app.folders d left join app.channels c on c.id=d.channel_id where d.id=$1 and d.family_id=$2`,[id,family]);if(!r)throw new NotFoundException('Folder not found.');return r;}
 private async file(client:PoolClient,family:string,id:string){const{rows:[r]}=await client.query<StoredFileDto>(`select ${fileFields} from app.stored_files f left join app.folders d on d.id=f.folder_id where f.id=$1 and f.family_id=$2 and f.state='ready'`,[id,family]);if(!r)throw new NotFoundException('File not found.');return r;}
 getFolder(actor:string,family:string,id:string){return this.run(actor,c=>this.folder(c,family,id));}
 getFile(actor:string,family:string,id:string){return this.run(actor,c=>this.file(c,family,id));}
 listFolders(actor:string,family:string,q:z.infer<typeof folderListInput>):Promise<FolderPageDto>{return this.run(actor,async client=>{
  const context=await this.context(client,family,q.channelId),cursor=q.cursor?this.cursor(q.cursor):null,limit=q.limit??30;
  const {rows}=await client.query<FolderDto&{sortValue:string}>(`select ${folderFields},lower(d.name) as "sortValue" from app.folders d left join app.channels c on c.id=d.channel_id
   where d.family_id=$1 and ($2::uuid is null or d.channel_id=$2) and ($3='all' or ($3='family' and d.channel_id is null) or ($3='channel' and d.channel_id is not null))
   and (d.archived_at is not null)=$4 and position(lower($5) in lower(d.name))>0 and ($6::text is null or (lower(d.name),d.id)>($6,$7::uuid)) order by lower(d.name),d.id limit $8`,[family,q.channelId??null,q.kind??'all',q.archived==='true',q.q??'',cursor?.[0]??null,cursor?.[1]??null,limit+1]);
  const page=rows.slice(0,limit),last=page.at(-1);return{...context,folders:page.map(({sortValue,...r})=>r),nextCursor:rows.length>limit&&last?this.encode(last.sortValue,last.id):null};
 });}
 createFolder(actor:string,family:string,input:z.infer<typeof folderCreateInput>){return this.run(actor,async client=>{await client.query('select app.create_folder($1,$2,$3,$4,$5,$6,$7)',[family,input.id,input.channelId??null,input.channelVersion??null,input.name,input.audience,input.selectedMemberIds]);return this.folder(client,family,input.id);},true);}
 editFolder(actor:string,family:string,id:string,input:z.infer<typeof folderEditInput>){return this.run(actor,async client=>{const{version,...data}=input;await client.query('select app.change_folder($1,$2,$3,$4)',[family,id,version,data]);return this.folder(client,family,id);},true);}
 archiveFolder(actor:string,family:string,id:string,input:{version:number;archived:boolean}){return this.run(actor,async client=>{await client.query('select app.change_folder($1,$2,$3,$4)',[family,id,input.version,{archived:input.archived}]);return this.folder(client,family,id);},true);}
 files(actor:string,family:string,q:z.infer<typeof fileListInput>):Promise<FilePageDto>{return this.run(actor,async client=>{
  if(q.folderId)await this.folder(client,family,q.folderId);else await this.context(client,family,q.channelId);
  const sort=q.sort??'recent',byName=sort.startsWith('name'),descending=sort==='recent'||sort==='name-desc',field=byName?'lower(f.file_name)':'f.created_at',direction=descending?'desc':'asc',operator=descending?'<':'>',cast=byName?'text':'timestamptz';
  const cursor=q.cursor?this.cursor(q.cursor):null,limit=q.limit??30;
  if(cursor&&!byName&&!Number.isFinite(Date.parse(cursor[0])))throw new BadRequestException('Invalid file page cursor.');
  const {rows}=await client.query<StoredFileDto&{sortValue:string}>(`select ${fileFields},${byName?field:field+'::text'} as "sortValue" from app.stored_files f join app.folders d on d.id=f.folder_id
   where f.family_id=$1 and f.state='ready' and ($2::uuid is null or f.folder_id=$2) and ($3::uuid is null or d.channel_id=$3 and d.archived_at is null)
   and (f.archived_at is not null)=$4 and position(lower($5) in lower(f.file_name))>0 and ($6='all' or ($6='image' and f.mime like 'image/%') or ($6='document' and f.mime not like 'image/%'))
   and ($7::${cast} is null or (${field},f.id)${operator}($7::${cast},$8::uuid)) order by ${field} ${direction},f.id ${direction} limit $9`,[family,q.folderId??null,q.channelId??null,q.archived==='true',q.q??'',q.type??'all',cursor?.[0]??null,cursor?.[1]??null,limit+1]);
  const page=rows.slice(0,limit),last=page.at(-1);return{files:page.map(({sortValue,...r})=>r),nextCursor:rows.length>limit&&last?this.encode(last.sortValue,last.id):null};
 });}
 async upload(actor:string,family:string,target:{folder?:string;image?:string},input:{id:string;version:number},file:IncomingFile){
  const data=await validateStoredFile(file,!!target.image);
  const reservation=await this.run(actor,async client=>{const{rows:[r]}=await client.query<{upload:{key:string;state:string}}>('select app.reserve_stored_file($1,$2,$3,$4,$5,$6,$7,$8,$9) as upload',[family,input.id,target.folder??null,target.image??null,input.version,data.fileName,data.mime,data.byteSize,data.hash]);return r.upload;},true);
  if(reservation.state!=='ready'){
   await this.storage.uploadFile(reservation.key,data.buffer,data.mime,data.hash);
   await this.run(actor,async client=>{await client.query('select app.finalize_stored_file($1,$2)',[family,input.id]);},true);
  }
  return this.getFile(actor,family,input.id);
 }
 // A file sent from the chat box needs no folder choice; the server picks the conversation's own.
 async chatUpload(actor:string,family:string,channel:string,id:string,file:IncomingFile,voiceSeconds?:number){
  const folder=await this.run(actor,async client=>{const{rows:[r]}=await client.query<{id:string;version:number}>('select id,version from app.chat_upload_folder($1,$2,$3)',[family,channel,id]);return r;},true);
  const saved=await this.upload(actor,family,{folder:folder.id},{id,version:folder.version},file);
  if(!voiceSeconds)return saved;
  return this.run(actor,async client=>{await client.query('select app.set_voice_note($1,$2,$3)',[family,id,voiceSeconds]);return this.file(client,family,id);});
 }
 async copyToChat(actor:string,family:string,source:string,channel:string,id:string){
  const grant=await this.readGrant(actor,family,source),buffer=await this.storage.readFile(grant.object_key);
  const {voiceSeconds}=await this.getFile(actor,family,source);
  return this.chatUpload(actor,family,channel,id,{buffer,size:buffer.length,originalname:Buffer.from(grant.file_name,'utf8').toString('latin1')},voiceSeconds??undefined);
 }
 archiveFile(actor:string,family:string,id:string,input:{version:number;archived:boolean}){return this.run(actor,async client=>{await client.query('select app.archive_stored_file($1,$2,$3,$4)',[family,id,input.version,input.archived]);return this.file(client,family,id);},true);}
 private readGrant(actor:string,family:string,id:string){return this.run(actor,async client=>{const{rows:[r]}=await client.query<{object_key:string;file_name:string;mime:string;byte_size:number}>('select * from app.stored_file_grant($1,$2)',[family,id]);if(!r)throw new NotFoundException('File unavailable. It may be archived or access may have ended.');return r;});}
 async download(actor:string,family:string,id:string){const r=await this.readGrant(actor,family,id);return this.storage.openFile(r.object_key,r.file_name);}
 async preview(actor:string,family:string,id:string):Promise<FilePreviewDto>{const r=await this.readGrant(actor,family,id),media=r.mime.split('/')[0];if(media==='image'||media==='audio'||media==='video'){const grant=await this.storage.openFile(r.object_key,r.file_name,true);return{kind:media,fileName:r.file_name,url:grant.url,expiresAt:grant.expiresAt,text:null};}if(r.mime.startsWith('text/')){const bytes=await this.storage.readFile(r.object_key);return{kind:'text',fileName:r.file_name,text:new TextDecoder('utf-8').decode(bytes).slice(0,50000),url:null,expiresAt:null};}throw new BadRequestException('Preview is available for images, recordings, video, text and CSV. Download this file to open it.');}
 async channelImage(actor:string,family:string,channel:string){const id=await this.run(actor,async client=>{const{rows:[c]}=await client.query<{id:string|null}>('select image_file_id as id from app.channels where id=$1 and family_id=$2',[channel,family]);if(!c?.id)throw new NotFoundException('Channel image not found.');return c.id;});return this.preview(actor,family,id);}
 removeImage(actor:string,family:string,channel:string,version:number){return this.run(actor,async client=>{await client.query('select app.remove_channel_image($1,$2,$3)',[family,channel,version]);return{id:channel};},true);}
 link(actor:string,family:string,channel:string,message:string,file:string){return this.run(actor,async client=>{await client.query('select app.link_message_file($1,$2,$3,$4)',[family,channel,message,file]);return{id:file};},true);}
 unlink(actor:string,family:string,channel:string,message:string,link:string){return this.run(actor,async client=>{await client.query('select app.unlink_message_file($1,$2,$3,$4)',[family,channel,message,link]);return{id:link};},true);}
 private cursor(value:string):[string,string]{try{const r=z.tuple([z.string().max(300),z.uuid()]).parse(JSON.parse(Buffer.from(value,'base64url').toString()));return r;}catch{throw new BadRequestException('Invalid page cursor.');}}
 private encode(value:string,id:string){return Buffer.from(JSON.stringify([value,id])).toString('base64url');}
}
