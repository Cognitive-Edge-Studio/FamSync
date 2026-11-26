import { BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseService } from './database.service.js';
import { AttachmentStorageService } from './attachment-storage.service.js';
import { JobsService } from './jobs.service.js';
import { JobsDatabaseService } from './jobs-database.service.js';
import type { IncomingFile } from './file-validation.js';
import { avatarPhoto, AvatarProviderError, generateAvatar } from './avatar-image.js';

type Generation = { id:string; status:string; error:string|null; expiresAt:Date };
const inputKey = (actor:string,id:string) => `avatars/${actor}/${id}/selfie.jpg`;
const outputKey = (actor:string,id:string) => `avatars/${actor}/${id}/avatar.webp`;
export function avatarSettings() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.AVATAR_AI_ENABLED === 'false' || process.env.FAMILY_AI_ENABLED === 'false') return null;
  return { apiKey,model:process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-nano-banana-2.1',baseUrl:process.env.GEMINI_BASE_URL?.trim() || 'https://generativelanguage.googleapis.com' };
}

@Injectable()
export class AvatarsService implements OnModuleInit {
  constructor(private readonly database:DatabaseService, private readonly storage:AttachmentStorageService,
    private readonly jobs:JobsService, private readonly jobsDatabase:JobsDatabaseService) {}
  onModuleInit() {
    this.jobs.register('avatar.generate',async(client,row)=>{
      const id=String(row.payload.generationId);
      const {rows:[lock]}=await client.query<{locked:boolean}>("select pg_try_advisory_lock(hashtextextended($1,0)) as locked",['avatar-generate:'+id]);
      if(!lock.locked)throw new Error('Avatar generation is already running');
      try { await this.generate(String(row.payload.actorId),id,row.attempts); }
      finally { await client.query('select pg_advisory_unlock(hashtextextended($1,0))',['avatar-generate:'+id]); }
    },{immediate:true});
    this.jobs.register('avatar.cleanup',(_client,row)=>this.cleanup(String(row.payload.actorId),String(row.payload.generationId)));
  }
  async status(actor:string) {
    const state = await this.database.withActor(actor,async client=>{
      const {rows:[profile]}=await client.query<{id:string|null}>('select avatar_generation_id as id from app.profiles where user_id=$1',[actor]);
      const {rows:[generation]}=await client.query<{id:string}>("select id from app.avatar_generations where user_id=$1 and status<>'expired' and expires_at>now() order by created_at desc limit 1",[actor]);
      return {hasAvatar:!!profile?.id,latestId:generation?.id&&generation.id!==profile?.id?generation.id:null};
    });
    return {...state,available:!!avatarSettings() && this.jobsDatabase.configured && this.storage.configured,dailyLimit:5};
  }
  async upload(actor:string,id:string,file:IncomingFile) {
    if (!avatarSettings() || !this.jobsDatabase.configured || !this.storage.configured) throw new ServiceUnavailableException('Avatar creation isn’t set up on this server yet.');
    const bytes=await avatarPhoto(file),hash=createHash('sha256').update(bytes).digest('hex');
    try { await this.database.withActor(actor,client=>client.query('select app.reserve_avatar($1,$2)',[id,hash])); }
    catch(error) {
      const problem=error as {code?:string;message?:string};
      if(problem.code==='P0001') throw new HttpException(problem.message!,429);
      if(problem.code==='22023') throw new BadRequestException(problem.message);
      throw error;
    }
    const current=await this.get(actor,id);
    if(current.status!=='uploading') return current;
    await this.storage.uploadFile(inputKey(actor,id),bytes,'image/jpeg',hash);
    await this.database.withActor(actor,async client=>{
      const changed=await client.query("update app.avatar_generations set status='queued' where id=$1 and status='uploading' and expires_at>now() returning id",[id]);
      if(changed.rowCount) await client.query("insert into app.outbox(kind,payload,dedupe_key) values('avatar.generate',$1,$2)",[{actorId:actor,generationId:id},'avatar-generate:'+id]);
    });
    await this.jobs.notify();
    return this.get(actor,id);
  }
  async get(actor:string,id:string) {
    const row=await this.database.withActor(actor,async client=>(await client.query<Generation>(
      'select id,status,error,expires_at as "expiresAt" from app.avatar_generations where id=$1',[id])).rows[0]);
    if(!row) throw new NotFoundException('Avatar preview not found.');
    const expired=row.expiresAt.getTime()<=Date.now();
    const preview=row.status==='ready'&&!expired ? await this.storage.openFile(outputKey(actor,id),'avatar.webp',true) : null;
    return {id:row.id,status:expired?'expired':row.status,error:row.error,previewUrl:preview?.url??null,expiresAt:row.expiresAt.toISOString()};
  }
  async accept(actor:string,id:string) {
    await this.database.withActor(actor,async client=>{
      const {rows:[old]}=await client.query<{id:string|null}>('select avatar_generation_id as id from app.profiles where user_id=$1 for update',[actor]);
      const {rows:[row]}=await client.query<Generation>('select id,status,expires_at as "expiresAt" from app.avatar_generations where id=$1 for update',[id]);
      if(old?.id===id && row?.status==='ready')return;
      if(!row || row.status!=='ready' || row.expiresAt.getTime()<=Date.now()) throw new BadRequestException('Create a new avatar preview before saving.');
      await client.query('insert into app.profiles(user_id,avatar_generation_id) values($1,$2) on conflict(user_id) do update set avatar_generation_id=$2,updated_at=now()',[actor,id]);
      if(old?.id && old.id!==id) {
        await client.query("update app.avatar_generations set status='expired' where id=$1",[old.id]);
        await this.queueCleanup(client,actor,old.id,'replaced');
      }
    });
    await this.jobs.notify();
    return {saved:true};
  }
  async reset(actor:string) {
    await this.database.withActor(actor,async client=>{
      const {rows:[old]}=await client.query<{id:string|null}>('select avatar_generation_id as id from app.profiles where user_id=$1 for update',[actor]);
      await client.query('update app.profiles set avatar_generation_id=null,updated_at=now() where user_id=$1',[actor]);
      if(old?.id) {
        await client.query("update app.avatar_generations set status='expired' where id=$1",[old.id]);
        await this.queueCleanup(client,actor,old.id,'reset');
      }
    });
    await this.jobs.notify();
    return {saved:true};
  }
  private queueCleanup(client:import('pg').PoolClient,actor:string,id:string,reason:string) {
    return client.query("insert into app.outbox(kind,payload,dedupe_key) values('avatar.cleanup',$1,$2)",[{actorId:actor,generationId:id},'avatar-'+reason+':'+randomUUID()]);
  }
  async resolve(actor:string,users:string[]) {
    const rows=await this.database.withActor(actor,async client=>(await client.query<{user_id:string;generation_id:string}>('select * from app.visible_avatars($1)',[users])).rows);
    const avatars=await Promise.all(rows.map(async row=>({userId:row.user_id,...await this.storage.openFile(outputKey(row.user_id,row.generation_id),'avatar.webp',true)})));
    return {avatars:avatars.map(({userId,url,expiresAt})=>({userId,url,expiresAt}))};
  }
  private async generate(actor:string,id:string,attempt:number) {
    const claimed=await this.database.withActor(actor,async client=>(await client.query(
      "update app.avatar_generations set status='working' where id=$1 and status in('queued','working') and expires_at>now() returning id",[id])).rowCount);
    if(!claimed) return;
    try {
      const settings=avatarSettings();
      if(!settings) throw new AvatarProviderError(false,'Avatar creation has been disabled.');
      // Reuse stored output if a worker stopped between upload and commit.
      let bytes=await this.storage.readOptionalFile(outputKey(actor,id));
      if(!bytes) {
        const photo=await this.storage.readFile(inputKey(actor,id));
        const reference=await readFile(new URL('../assets/avatars/style.webp',import.meta.url));
        bytes=await generateAvatar(photo,reference,settings);
        await this.storage.uploadFile(outputKey(actor,id),bytes,'image/webp',createHash('sha256').update(bytes).digest('hex'));
      }
      await this.database.withActor(actor,client=>client.query("update app.avatar_generations set status='ready',error=null where id=$1 and status='working'",[id]));
    } catch(error) {
      if(attempt<3 && (!(error instanceof AvatarProviderError)||error.retryable)) throw new Error('Avatar generation temporarily unavailable');
      const message=error instanceof AvatarProviderError?error.userMessage:'We couldn’t create your avatar. Please try again.';
      await this.database.withActor(actor,client=>client.query("update app.avatar_generations set status='failed',error=$2 where id=$1",[id,message]));
    }
    await this.storage.discard(inputKey(actor,id));
  }
  private async cleanup(actor:string,id:string) {
    await this.database.withActor(actor,async client=>{
      const {rows:[row]}=await client.query('select id from app.avatar_generations where id=$1 for update',[id]);
      if(!row) { await this.storage.removeFile(inputKey(actor,id)); await this.storage.removeFile(outputKey(actor,id)); return; }
      await this.storage.removeFile(inputKey(actor,id));
      const selected=(await client.query('select 1 from app.profiles where user_id=$1 and avatar_generation_id=$2',[actor,id])).rowCount;
      if(selected) return;
      await client.query("update app.avatar_generations set status='expired',error=null where id=$1",[id]);
      await this.storage.removeFile(outputKey(actor,id));
    });
  }
}
