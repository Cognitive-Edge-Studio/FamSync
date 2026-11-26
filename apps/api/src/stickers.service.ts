import {BadRequestException,HttpException,Injectable,NotFoundException,ServiceUnavailableException,type OnModuleInit} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {DatabaseService} from './database.service.js';
import {AttachmentStorageService} from './attachment-storage.service.js';
import {JobsService} from './jobs.service.js';
import {JobsDatabaseService} from './jobs-database.service.js';
import {FilesService} from './files.service.js';
import {avatarSettings} from './avatars.service.js';
import {AvatarProviderError} from './avatar-image.js';
import {generateStickerSheet,splitStickerSheet,stickerKeys,stickerLabels} from './sticker-image.js';
type Pack={id:string;avatarId:string;status:string;error:string|null};
const key=(actor:string,id:string,part:string)=>`stickers/${actor}/${id}/${part}`;
const fields='s.id,s.avatar_id as "avatarId",s.status,s.error';
@Injectable()
export class StickersService implements OnModuleInit {
  constructor(private readonly database:DatabaseService,private readonly storage:AttachmentStorageService,private readonly jobs:JobsService,private readonly jobsDatabase:JobsDatabaseService,private readonly files:FilesService){}
  onModuleInit(){
    this.jobs.register('stickers.generate',async(client,row)=>{
      const actor=String(row.payload.actorId),id=String(row.payload.packId),lockKey='stickers:'+id;
      const {rows:[lock]}=await client.query<{locked:boolean}>('select pg_try_advisory_lock(hashtextextended($1,0)) as locked',[lockKey]);
      if(!lock.locked)throw Error('Sticker generation already running');
      try{await this.generate(actor,id,row.attempts);}finally{await client.query('select pg_advisory_unlock(hashtextextended($1,0))',[lockKey]);}
    },{immediate:true});
    this.jobs.register('stickers.cleanup',(_client,row)=>this.cleanup(String(row.payload.actorId),String(row.payload.packId)));
  }
  private available(){return !!avatarSettings()&&this.storage.configured&&this.jobsDatabase.configured;}
  private async current(actor:string){return this.database.withActor(actor,async client=>{
    const {rows:[profile]}=await client.query<{avatar:string|null}>('select avatar_generation_id as avatar from app.profiles where user_id=$1',[actor]);
    const {rows:[pack]}=await client.query<Pack>(`select ${fields} from app.avatar_sticker_packs s where s.user_id=$1 and s.avatar_id=$2`,[actor,profile?.avatar??null]);
    return {avatar:profile?.avatar??null,pack};
  });}
  async status(actor:string){
    const {avatar,pack}=await this.current(actor);
    const stickers=pack?.status==='ready'?await Promise.all(stickerKeys.map(async(expression,i)=>({expression,label:stickerLabels[i],...await this.storage.openFile(key(actor,pack.id,expression+'.webp'),'avatar-sticker.webp',true)}))):[];
    return {available:this.available(),hasAvatar:!!avatar,pack:pack?{id:pack.id,status:pack.status,error:pack.error}:null,stickers:stickers.map(({expression,label,url,expiresAt})=>({expression,label,url,expiresAt}))};
  }
  async create(actor:string,id:string){
    if(!this.available())throw new ServiceUnavailableException('Sticker creation isn’t available right now.');
    try{await this.database.withActor(actor,client=>client.query('select app.reserve_avatar_stickers($1)',[id]));}
    catch(error){const problem=error as {code?:string;message:string};if(problem.code==='22023')throw new BadRequestException(problem.message);if(problem.code==='P0001')throw new HttpException(problem.message,429);if(problem.code==='23505')throw new BadRequestException('Start a new sticker request.');throw error;}
    await this.jobs.notify();return this.status(actor);
  }
  async prepare(actor:string,family:string,channel:string,packId:string,expression:string,id:string){
    const index=stickerKeys.indexOf(expression as typeof stickerKeys[number]);
    const {pack}=await this.current(actor);
    if(index<0||!pack||pack.id!==packId||pack.status!=='ready')throw new NotFoundException('Choose a sticker from your current avatar.');
    // Check conversation access before reading the private pack or creating its conversation copy.
    await this.database.withActor(actor,async client=>{const {rowCount}=await client.query('select 1 from app.channels where id=$1 and family_id=$2 and archived_at is null',[channel,family]);if(!rowCount)throw new NotFoundException('Conversation not found.');});
    const buffer=await this.storage.readFile(key(actor,packId,expression+'.webp'));
    const reused=await this.database.withActor(actor,async client=>(await client.query<{id:string|null}>('select app.find_avatar_sticker_copy($1,$2,$3) as id',[family,channel,createHash('sha256').update(buffer).digest('hex')])).rows[0]?.id);
    if(reused)return this.files.getFile(actor,family,reused);
    const saved=await this.files.chatUpload(actor,family,channel,id,{buffer,size:buffer.length,originalname:stickerLabels[index]+' avatar sticker.webp'});
    await this.database.withActor(actor,client=>client.query('select app.mark_avatar_sticker_file($1,$2)',[family,saved.id]));
    return {...saved,sticker:true};
  }
  private async generate(actor:string,id:string,attempt:number){
    const pack=await this.database.withActor(actor,async client=>{
      const {rows:[row]}=await client.query<Pack>(`update app.avatar_sticker_packs s set status='working' where s.id=$1 and s.status in('queued','working') and exists(select 1 from app.profiles p where p.user_id=$2 and p.avatar_generation_id=s.avatar_id) returning ${fields}`,[id,actor]);return row;
    });
    if(!pack)return;
    try{
      const settings=avatarSettings();if(!settings)throw new AvatarProviderError(false,'Sticker creation has been disabled.');
      let sheet=await this.storage.readOptionalFile(key(actor,id,'sheet.jpg'));
      if(!sheet){
        const avatar=await this.storage.readFile(`avatars/${actor}/${pack.avatarId}/avatar.webp`);
        sheet=await generateStickerSheet(avatar,settings);
        // Validate before storing, then reuse the sheet after a worker restart.
        await splitStickerSheet(sheet);
        await this.storage.uploadFile(key(actor,id,'sheet.jpg'),sheet,'image/jpeg',createHash('sha256').update(sheet).digest('hex'));
      }
      const stickers=await splitStickerSheet(sheet);
      for(let i=0;i<stickers.length;i++)await this.storage.uploadFile(key(actor,id,stickerKeys[i]+'.webp'),stickers[i],'image/webp',createHash('sha256').update(stickers[i]).digest('hex'));
      const saved=await this.database.withActor(actor,client=>client.query("update app.avatar_sticker_packs set status='ready',error=null where id=$1 and status='working' and exists(select 1 from app.profiles where user_id=$2 and avatar_generation_id=$3) returning id",[id,actor,pack.avatarId]));
      if(!saved.rowCount)await this.cleanup(actor,id);
    }catch(error){
      if(attempt<3&&(!(error instanceof AvatarProviderError)||error.retryable))throw Error('Sticker generation temporarily unavailable');
      await this.database.withActor(actor,client=>client.query("update app.avatar_sticker_packs set status='failed',error=$2 where id=$1 and status='working'",[id,error instanceof AvatarProviderError?error.userMessage:'We couldn’t create your stickers. Please try again.']));
    }
  }
  private async cleanup(actor:string,id:string){
    await this.database.withActor(actor,async client=>{
      const {rows:[pack]}=await client.query<Pack>(`select ${fields} from app.avatar_sticker_packs s where s.id=$1 for update`,[id]);
      if(pack&&(await client.query("select 1 from app.profiles where user_id=$1 and avatar_generation_id=$2 and $3='ready'",[actor,pack.avatarId,pack.status])).rowCount)return;
      for(const part of ['sheet.jpg',...stickerKeys.map(expression=>expression+'.webp')])await this.storage.removeFile(key(actor,id,part));
      if(pack)await client.query("update app.avatar_sticker_packs set status='expired' where id=$1",[id]);
    });
  }
}
