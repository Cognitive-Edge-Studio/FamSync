import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { DatabaseService } from './database.service.js';
import { JobsService } from './jobs.service.js';
import { Params, person, TasksService } from './tasks.service.js';
import type { AttachmentKind, ChannelDetailDto, ChannelDto, ChannelHistoryDto, ChannelHistoryInput, ChannelListInput, ChannelMessageDto,
  ChannelMessageInput, ChannelPageDto, CreateChannelInput, MessageWorkDto, MessageSearchPageDto, LinkableEventPageDto, MessageSourcePageDto } from './channels.dto.js';
import type {CreateTaskInput} from './tasks.dto.js';
import {createHash} from 'node:crypto';
import {FilesService} from './files.service.js';
import {JobsDatabaseService} from './jobs-database.service.js';
import {ChannelRealtimeService} from './channel-realtime.service.js';

type Context = { names: Map<string,string>; guests:Set<string>; member:boolean };
type LastRow = {id:string;body:string;deleted:boolean;fileCount:number;attachment:AttachmentKind|null;authorId:string|null;createdAt:string};
type ChannelRow = Omit<ChannelDto,'manager'|'isManager'|'lastMessage'|'peer'> & { managerId: string | null; last: LastRow|null; activity: string; pairLow:string|null;pairHigh:string|null };
type ReactionRow = {emoji:string;count:number;active:boolean;userIds:string[]};
type MessageRow = Omit<ChannelMessageDto,'author'|'replyTo'|'createdAt'|'mentions'|'reactions'|'editedAt'|'editableUntil'|'deletableUntil'> & { reactions:ReactionRow[];editedAt:Date|null;editableUntil:Date|null;deletableUntil:Date|null;parentDeleted:boolean;parentFiles:number;parentAttachment:AttachmentKind|null; mentionedIds:string[];authorId: string | null; createdAt: Date;
  parentId: string | null; parentBody: string | null; parentAuthorId: string | null };
const attachmentOf=(alias:string)=>`(select case when f.voice_seconds is not null then 'voice' when f.mime like 'image/%' then 'photo' when f.mime like 'video/%' then 'video' else 'file' end
  from app.message_file_links l left join app.stored_files f on f.id=l.file_id where l.message_id=${alias}.id order by l.id limit 1)`;
const channelFields = `c.id,c.name,c.emoji,c.topic,c.description,c.manager_id as "managerId",c.version,c.kind,c.image_file_id as "imageFileId",p.muted,p.pinned_at is not null as pinned,p.hidden_at is not null as hidden,p.marked_unread as "markedUnread",app.is_channel_admin(c.id,$2::uuid) as "canManage",c.pair_low as "pairLow",c.pair_high as "pairHigh",
 c.archived_at is not null as archived,c.last_position as "lastPosition",p.last_read as "readPosition",p.delivered_position as "deliveredPosition",
 coalesce(lm.created_at,c.created_at)::text as activity,
 case when lm.id is not null then jsonb_build_object('id',lm.id,'body',left(lm.body,160),'deleted',lm.deleted_at is not null,'fileCount',(select count(*) from app.message_file_links l where l.message_id=lm.id),'attachment',${attachmentOf('lm')},'authorId',lm.author_id,'createdAt',lm.created_at) end as last,
 (select count(*)::int from app.channel_participants cp where cp.channel_id=c.id) as "memberCount",
 (select count(*)::int from app.channel_messages m where m.channel_id=c.id and m.position>p.last_read and m.author_id is distinct from $2::uuid and m.deleted_at is null) as unread`;
const channelSource = `app.channels c join app.channel_participants p on p.channel_id=c.id and p.user_id=$2
 left join app.channel_messages lm on lm.channel_id=c.id and lm.position=c.last_position`;
const messageFields = `m.id,m.body,m.position,m.change_seq as "changeSeq",m.deleted_at is not null as deleted,m.forwarded,m.edited_at as "editedAt",m.edit_count as "editCount",
 exists(select 1 from app.message_stars s where s.message_id=m.id and s.user_id=$2::uuid) as starred,exists(select 1 from app.message_pins pin where pin.message_id=m.id) as pinned,
 case when m.author_id=$2::uuid and m.deleted_at is null then m.created_at+interval '15 minutes' end as "editableUntil",
 case when m.author_id=$2::uuid and m.deleted_at is null then m.created_at+interval '48 hours' end as "deletableUntil",
 parent.deleted_at is not null as "parentDeleted",(select count(*)::int from app.message_file_links l where l.message_id=parent.id) as "parentFiles",${attachmentOf('parent')} as "parentAttachment",m.author_id as "authorId",m.created_at as "createdAt",m.mentioned_user_ids as "mentionedIds",
 parent.id as "parentId",left(parent.body,180) as "parentBody",parent.author_id as "parentAuthorId",
 coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'fileId',f.id,'fileName',f.file_name,'mime',f.mime,'byteSize',f.byte_size,'voiceSeconds',f.voice_seconds,'canUnlink',coalesce(l.author_id=$2::uuid,false) or exists(select 1 from app.channels ch where ch.id=m.channel_id and ch.manager_id=$2::uuid)))
  from app.message_file_links l left join (app.stored_files f join app.folders fd on fd.id=f.folder_id and fd.archived_at is null) on f.id=l.file_id and f.state='ready' and f.archived_at is null where l.message_id=m.id),'[]'::jsonb) as files,
 coalesce((select jsonb_agg(w) from (
  select refs.id,'task'::text as kind,t.id as "targetId",t.title,
   case when t.id is not null then '/task/?family='||t.family_id::text||'&id='||t.id::text end as path,
   coalesce(t.author_id=$2::uuid,false) as "canUnlink",coalesce(t.version,1) as version
  from app.message_task_refs(m.id) refs left join app.tasks t on t.id=refs.id
  union all
  select l.id,'event',e.id,e.title,case when e.id is not null then '/event/?family='||e.family_id::text||'&id='||e.id::text end,
   l.author_id=$2::uuid,1 from app.message_event_links l left join app.calendar_events e on e.id=l.event_id where l.message_id=m.id
 ) w),'[]'::jsonb) as work,
 coalesce((select jsonb_agg(r) from (select emoji,count(*)::int as count,bool_or(user_id=$2::uuid) as active,array_agg(user_id) as "userIds"
  from app.channel_reactions where message_id=m.id group by emoji order by emoji) r),'[]'::jsonb) as reactions`;
const messageSource = `app.channel_messages m left join app.channel_messages parent on parent.id=m.reply_to_id`;
function toChannel(row: ChannelRow, actor: string, context: Context): ChannelDto {
  const { managerId, last,activity,pairLow,pairHigh, ...rest } = row;
  const peer=row.kind==='dm'?person(pairLow===actor?pairHigh:pairLow,context.names):null;
  return { ...rest,peer,name:row.kind==='dm'?(peer?.name??'Former member'):row.name,
    lastMessage:last?{id:last.id,body:last.body,deleted:last.deleted,fileCount:last.fileCount,attachment:last.attachment,author:person(last.authorId,context.names),createdAt:new Date(last.createdAt).toISOString()}:null,
    manager: person(managerId,context.names), canCreateWork:context.member,isManager:context.member&&row.kind==='channel'&&managerId===actor };
}
function toMessage(row: MessageRow, context: Context): ChannelMessageDto {
  const { authorId,parentId,parentBody,parentAuthorId,parentDeleted,parentFiles,parentAttachment,createdAt,editedAt,editableUntil,deletableUntil,mentionedIds,reactions,...rest }=row;
  return { ...rest,work:rest.deleted?[]:rest.work,editedAt:editedAt?.toISOString()??null,editableUntil:editableUntil?.toISOString()??null,deletableUntil:deletableUntil?.toISOString()??null,
    reactions:reactions.map(({userIds,...reaction})=>({...reaction,people:userIds.map(id=>person(id,context.names)!)})),mentions:mentionedIds.map(id=>person(id,context.names)!),author:person(authorId,context.names),createdAt:createdAt.toISOString(),
    replyTo:parentId ? {id:parentId,body:parentBody!,deleted:parentDeleted,fileCount:parentFiles,attachment:parentAttachment,author:person(parentAuthorId,context.names)} : null };
}

@Injectable()
export class ChannelsService {
  constructor(private readonly database: DatabaseService,private readonly jobs: JobsService,private readonly tasks:TasksService,private readonly files:FilesService,
    private readonly jobsDatabase:JobsDatabaseService,private readonly realtime:ChannelRealtimeService) {}
  private readonly typed=new Map<string,number>();
  private async run<T>(actor:string,family:string,work:(client:PoolClient,context:Context)=>Promise<T>,write=false) {
    try {
      const result=await this.database.withActor(actor,async client=>{
        const {rows}=await client.query<{id:string;name:string;guest:boolean}>('select * from app.conversation_context($1)',[family]);
        if(!rows.some(r=>r.id===actor))throw new NotFoundException('Conversation workspace not found.');
        return work(client,{names:new Map(rows.map(r=>[r.id,r.name])),guests:new Set(rows.filter(r=>r.guest).map(r=>r.id)),member:!rows.find(r=>r.id===actor)!.guest});
      });
      if(write) await this.jobs.notify();
      return result;
    } catch(error) {
      const code=(error as {code?:string}).code;
      if(code==='P0002') throw new NotFoundException('Channel or message not found.');
      if(code==='42501') throw new ForbiddenException('You do not have permission to make this change.');
      if(code==='40001'||code==='40P01') throw new ConflictException('This channel changed. Refresh before trying again.');
      if(code==='23505') throw new ConflictException('This ID is already in use. Refresh before trying again.');
      if(code==='22023') throw new BadRequestException((error as Error).message);
      if(['23514','23502','23503','22003','22P02'].includes(code??'')) throw new BadRequestException('Check the channel, participants and message fields.');
      throw error;
    }
  }
  list(actor:string,family:string,query:ChannelListInput):Promise<ChannelPageDto> {
    return this.run(actor,family,async(client,context)=>{
      if(query.kind==='dm'&&!context.member)throw new ForbiddenException('Direct messages are available to family members.');
      const params=new Params();params.add(family,'uuid');params.add(actor,'uuid');
      const kind=query.kind??'channel';
      const filters=['c.family_id=$1',...(kind==='all'?[]:['c.kind='+params.add(kind,'text')]),query.archived==='true'?'(c.archived_at is not null or p.hidden_at is not null)':'c.archived_at is null and p.hidden_at is null'];
      if(query.q){
        const matching=[...context.names].filter(([id,name])=>id!==actor&&name.toLowerCase().includes(query.q!.toLowerCase())).map(([id])=>id);
        const ids=params.add(matching,'uuid[]'),text=params.add(query.q,'text');
        filters.push("(case when c.kind='dm' then c.pair_low=any("+ids+") or c.pair_high=any("+ids+") else position(lower("+text+") in lower(c.name||' '||c.topic))>0 end)");
      }
      if(query.cursor) {
        let cursor:unknown;
        try { cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString()); } catch { throw new BadRequestException('Invalid channel page cursor.'); }
        const parsed=z.tuple([z.boolean(),z.string().max(64),z.uuid()]).safeParse(cursor);
        if(!parsed.success||!Number.isFinite(Date.parse(parsed.data[1]))) throw new BadRequestException('Invalid channel page cursor.');
        filters.push('((p.pinned_at is not null),coalesce(lm.created_at,c.created_at),c.id)<('+params.add(parsed.data[0],'boolean')+','+params.add(parsed.data[1],'timestamptz')+','+params.add(parsed.data[2],'uuid')+')');
      }
      const limit=query.limit??30;
      const {rows}=await client.query<ChannelRow>(`select ${channelFields} from ${channelSource}
        where ${filters.join(' and ')} order by (p.pinned_at is not null) desc,coalesce(lm.created_at,c.created_at) desc,c.id desc limit ${limit+1}`,params.values);
      const page=rows.slice(0,limit),last=page.at(-1);
      return {channels:page.map(row=>toChannel(row,actor,context)),nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify([last.pinned,last.activity,last.id])).toString('base64url'):null};
    });
  }
  get(actor:string,family:string,id:string) { return this.run(actor,family,(client,context)=>this.detail(client,actor,family,id,context)); }
  create(actor:string,family:string,input:CreateChannelInput) {
    return this.run(actor,family,async(client,context)=>{
      await client.query('select app.create_channel($1,$2,$3)',[family,input.id,input]);
      return this.detail(client,actor,family,input.id,context);
    },true);
  }
  change(actor:string,family:string,id:string,action:string,input:{version:number;[key:string]:unknown}) {
    return this.run(actor,family,async(client,context)=>{
      await client.query('select app.change_channel($1,$2,$3,$4,$5)',[family,id,input.version,action,input]);
      return this.detail(client,actor,family,id,context);
    },true);
  }
  history(actor:string,family:string,id:string,query:ChannelHistoryInput):Promise<ChannelHistoryDto> {
    return this.run(actor,family,async(client,context)=>{
      const channel=await this.detail(client,actor,family,id,context),limit=query.limit??50;
      // Read the marker before the messages: anything newer is simply sent again on the next request.
      const {rows:[counter]}=await client.query<{seq:number}>('select seq from app.channel_change_counters where channel_id=$1',[id]);
      const latestChange=counter?.seq??0;
      if(query.changedSince!==undefined){
        const {rows}=await client.query<MessageRow>(`select ${messageFields} from ${messageSource}
          where m.channel_id=$1 and m.change_seq>$3 and m.position>=$4 order by m.change_seq limit $5`,[id,actor,query.changedSince,query.from??0,limit+1]);
        const page=rows.slice(0,limit);
        return {messages:page.map(row=>toMessage(row,context)),latestPosition:channel.lastPosition,latestChange,nextBefore:null,nextAfter:null,
          nextChange:rows.length>limit?page.at(-1)!.changeSeq:null};
      }
      const params=[id,actor,query.after??query.before??null,limit+1];
      const filter=query.after!==undefined?'m.position>$3::int':query.before!==undefined?'m.position<$3::int':'($3::int is null)';
      const forward=query.after!==undefined;
      const {rows}=await client.query<MessageRow>(`select ${messageFields} from ${messageSource}
        where m.channel_id=$1 and ${filter} order by m.position ${forward?'asc':'desc'} limit $4`,params);
      const page=rows.slice(0,limit);if(!forward) page.reverse();
      return {messages:page.map(row=>toMessage(row,context)),latestPosition:channel.lastPosition,latestChange,nextChange:null,
        nextBefore:!forward&&rows.length>limit?page[0].position:null,
        nextAfter:forward&&rows.length>limit?page.at(-1)!.position:null};
    });
  }
  post(actor:string,family:string,id:string,input:ChannelMessageInput) {
    return this.run(actor,family,async(client,context)=>{
      await client.query('select app.post_message_with_files($1,$2,$3,$4,$5,$6,$7)',[family,id,input.id,input.body,input.replyToId??null,input.mentionedUserIds??[],input.fileIds??[]]);
      return this.message(client,actor,id,input.id,context);
    },true);
  }
  react(actor:string,family:string,id:string,message:string,input:{emoji:string;active:boolean}) {
    return this.run(actor,family,async(client,context)=>{
      await client.query('select app.react_channel_message($1,$2,$3,$4,$5)',[family,id,message,input.emoji,input.active]);
      return this.message(client,actor,id,message,context);
    },true);
  }
  read(actor:string,family:string,id:string,position:number) {
    return this.run(actor,family,async(client,context)=>{
      await client.query('select app.read_channel($1,$2,$3)',[family,id,position]);
      return this.detail(client,actor,family,id,context);
    },true);
  }
  edit(actor:string,family:string,id:string,message:string,input:{editCount:number;body:string;mentionedUserIds?:string[]}){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.edit_message($1,$2,$3,$4,$5,$6)',[family,id,message,input.editCount,input.body,input.mentionedUserIds??[]]);return this.message(client,actor,id,message,context);
  },true);}
  remove(actor:string,family:string,id:string,message:string){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.delete_message($1,$2,$3)',[family,id,message]);return this.message(client,actor,id,message,context);
  },true);}
  pin(actor:string,family:string,id:string,message:string,pinned:boolean){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.pin_message($1,$2,$3,$4)',[family,id,message,pinned]);return this.message(client,actor,id,message,context);
  },true);}
  star(actor:string,family:string,id:string,message:string,starred:boolean){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.star_message($1,$2,$3,$4)',[family,id,message,starred]);return this.message(client,actor,id,message,context);
  });}
  preferences(actor:string,family:string,id:string,input:{pinned?:boolean;hidden?:boolean;unread?:boolean}){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.set_conversation_preferences($1,$2,$3,$4,$5)',[family,id,input.pinned??null,input.hidden??null,input.unread??null]);return this.detail(client,actor,family,id,context);
  });}
  setAdmin(actor:string,family:string,id:string,user:string,input:{version:number;admin:boolean}){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.set_channel_admin($1,$2,$3,$4,$5)',[family,id,input.version,user,input.admin]);return this.detail(client,actor,family,id,context);
  },true);}
  handOver(actor:string,family:string,id:string,input:{version:number;userId:string}){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.hand_over_channel($1,$2,$3,$4)',[family,id,input.version,input.userId]);return this.detail(client,actor,family,id,context);
  },true);}
  leave(actor:string,family:string,id:string){return this.run(actor,family,async client=>{await client.query('select app.leave_channel($1,$2)',[family,id]);return {id};},true);}
  // Files belong to one conversation, so a forwarded file is copied with the caller's own read access.
  async forward(actor:string,family:string,target:string,input:{id:string;conversationId:string;messageId:string}){
    const sent=await this.run(actor,family,async(client,context)=>{
      await this.detail(client,actor,family,target,context);
      const {rowCount}=await client.query('select 1 from app.channel_messages where id=$1 and channel_id=$2 and author_id=$3',[input.id,target,actor]);
      return rowCount?this.message(client,actor,target,input.id,context):null;
    });
    if(sent) return sent;
    const source=await this.getMessage(actor,family,input.conversationId,input.messageId);
    if(source.deleted) throw new BadRequestException('This message was deleted.');
    const fileIds:string[]=[];
    for(const file of source.files){
      if(!file.fileId) continue;
      const hex=createHash('sha256').update(input.id+file.fileId).digest('hex');
      const copy=[hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),'8'+hex.slice(17,20),hex.slice(20,32)].join('-');
      await this.files.copyToChat(actor,family,file.fileId,target,copy);fileIds.push(copy);
    }
    if(!source.body&&!fileIds.length) throw new BadRequestException('There is nothing to forward. The attached file is unavailable.');
    return this.run(actor,family,async(client,context)=>{
      await client.query('select app.post_message_with_files($1,$2,$3,$4,null,$5,$6)',[family,target,input.id,source.body,[],fileIds]);
      await client.query('select app.mark_forwarded($1,$2,$3)',[family,target,input.id]);
      return this.message(client,actor,target,input.id,context);
    },true);
  }
  delivered(actor:string,family:string,items:{id:string;position:number}[]){return this.run(actor,family,async client=>{
    await client.query('select app.mark_delivered($1,$2)',[family,JSON.stringify(items)]);return {ok:true};
  },true);}
  async typing(actor:string,family:string,id:string,active:boolean){
    await this.run(actor,family,async client=>{
      if(!(await client.query('select 1 from app.channels where id=$1 and family_id=$2',[id,family])).rowCount) throw new NotFoundException('Channel not found.');
    });
    // At most one start signal every two seconds per person and conversation; stopping is always sent.
    const key=actor+id,now=Date.now();
    if(active&&now-(this.typed.get(key)??0)<2000) return {ok:true};
    if(active){if(this.typed.size>5000)this.typed.clear();this.typed.set(key,now);}else this.typed.delete(key);
    // A missed typing signal is harmless, so a failure is not reported.
    if(this.jobsDatabase.configured) await this.jobsDatabase.withClient(client=>this.realtime.typing(client,id,actor,active)).catch(()=>undefined);
    return {ok:true};
  }
  openDirect(actor:string,family:string,peer:string){
    return this.run(actor,family,async(client,context)=>{
      if(!context.member)throw new ForbiddenException('Only family members can open direct messages.');
      const {rows:[row]}=await client.query<{id:string}>('select app.open_direct_conversation($1,$2) as id',[family,peer]);
      return this.detail(client,actor,family,row.id,context);
    },true);
  }
  mute(actor:string,family:string,id:string,muted:boolean){return this.run(actor,family,async(client,context)=>{
    await client.query('select app.mute_conversation($1,$2,$3)',[family,id,muted]);return this.detail(client,actor,family,id,context);
  },true);}
  getMessage(actor:string,family:string,channel:string,id:string){return this.run(actor,family,async(client,context)=>{
    await this.detail(client,actor,family,channel,context);return this.message(client,actor,channel,id,context);
  });}
  search(actor:string,family:string,query:{q:string;conversationId?:string;cursor?:string;limit?:number}):Promise<MessageSearchPageDto>{
    return this.run(actor,family,async(client,context)=>{
      if(query.conversationId)await this.detail(client,actor,family,query.conversationId,context);
      const params=new Params();params.add(family,'uuid');params.add(actor,'uuid');
      const filters=['c.family_id=$1','m.deleted_at is null','position(lower('+params.add(query.q,'text')+') in lower(m.body))>0'];
      if(query.conversationId)filters.push('m.channel_id='+params.add(query.conversationId,'uuid'));
      if(query.cursor){const [date,id]=this.cursor(query.cursor);filters.push('(m.created_at,m.id)<('+params.add(date,'timestamptz')+','+params.add(id,'uuid')+')');}
      const limit=query.limit??30;
      return this.messagePage(client,context,filters,params.values,limit,'m.created_at');
    });
  }
  starred(actor:string,family:string,query:{cursor?:string;limit?:number}):Promise<MessageSearchPageDto>{
    return this.run(actor,family,async(client,context)=>{
      const params=new Params();params.add(family,'uuid');params.add(actor,'uuid');
      const filters=['c.family_id=$1','m.deleted_at is null','star.user_id=$2'];
      if(query.cursor){const [date,id]=this.cursor(query.cursor);filters.push('(star.created_at,m.id)<('+params.add(date,'timestamptz')+','+params.add(id,'uuid')+')');}
      return this.messagePage(client,context,filters,params.values,query.limit??30,'star.created_at','join app.message_stars star on star.message_id=m.id');
    });
  }
  private async messagePage(client:PoolClient,context:Context,filters:string[],values:unknown[],limit:number,order:string,join=''):Promise<MessageSearchPageDto>{
      const {rows}=await client.query<MessageRow & {conversationId:string;conversationName:string;conversationKind:ChannelDto['kind'];sortCreated:string;peerId:string|null}>(`
        select ${messageFields},c.id as "conversationId",c.name as "conversationName",c.kind as "conversationKind",${order}::text as "sortCreated",
        case when c.pair_low=$2::uuid then c.pair_high else c.pair_low end as "peerId"
        from ${messageSource} join app.channels c on c.id=m.channel_id ${join} where ${filters.join(' and ')} order by ${order} desc,m.id desc limit ${limit+1}`,values);
      const page=rows.slice(0,limit),last=page.at(-1);
      return {messages:page.map(row=>{const {conversationId,conversationName,conversationKind,sortCreated,peerId,...m}=row;return {...toMessage(m,context),conversationId,conversationName:conversationKind==='dm'?(person(peerId,context.names)?.name??'Former member'):conversationName,conversationKind};}),
        nextCursor:rows.length>limit&&last?this.encode(last.sortCreated,last.id):null};
  }
  async taskFromMessage(actor:string,family:string,channel:string,message:string,input:CreateTaskInput&{conversationVersion:number}){
    if(!(await this.get(actor,family,channel)).canCreateWork)throw new ForbiddenException('Only family members can create linked work.');
    await this.getMessage(actor,family,channel,message);
    const {conversationVersion,...task}=input;
    return this.tasks.create(actor,family,task,{messageId:message,version:conversationVersion});
  }
  events(actor:string,family:string,channel:string,message:string,query:{q?:string;cursor?:string;limit?:number}):Promise<LinkableEventPageDto>{
    return this.run(actor,family,async(client,context)=>{
      if(!context.member)throw new ForbiddenException('Only family members can link work.');
      await this.detail(client,actor,family,channel,context);await this.message(client,actor,channel,message,context);
      const params=new Params();params.add(family,'uuid');const filters=['e.family_id=$1'];
      if(query.q)filters.push('position(lower('+params.add(query.q,'text')+') in lower(e.title))>0');
      if(query.cursor){const [date,id]=this.cursor(query.cursor);filters.push('(e.created_at,e.id)>('+params.add(date,'timestamptz')+','+params.add(id,'uuid')+')');}
      const limit=query.limit??20;
      const {rows}=await client.query<{id:string;title:string;created:string}>(`select e.id,e.title,e.created_at::text as created from app.calendar_events e
        where ${filters.join(' and ')} order by e.created_at,e.id limit ${limit+1}`,params.values);
      const page=rows.slice(0,limit),last=page.at(-1);return {events:page.map(({created,...e})=>e),nextCursor:rows.length>limit&&last?this.encode(last.created,last.id):null};
    });
  }
  linkEvent(actor:string,family:string,channel:string,message:string,input:{id:string;eventId:string;version:number}){
    return this.run(actor,family,async(client,context)=>{
      if(!context.member)throw new ForbiddenException('Only family members can link work.');
      await client.query('select app.link_message_event($1,$2,$3,$4,$5,$6)',[family,channel,message,input.id,input.eventId,input.version]);
      return this.message(client,actor,channel,message,context);
    },true);
  }
  unlinkWork(actor:string,family:string,channel:string,message:string,kind:'task'|'event',id:string,version:number){
    return this.run(actor,family,async(client,context)=>{
      await this.detail(client,actor,family,channel,context);
      const original=await this.message(client,actor,channel,message,context);
      if(!original.work.some(work=>work.id===id&&work.kind===kind))throw new NotFoundException('Work link not found.');
      if(kind==='task')await client.query('select app.unlink_task_message($1,$2,$3)',[family,id,version]);
      else await client.query('select app.unlink_message_event($1,$2,$3)',[family,message,id]);
      return this.message(client,actor,channel,message,context);
    },true);
  }
  unlinkTaskSource(actor:string,family:string,task:string,version:number){return this.run(actor,family,async(client)=>{
    await client.query('select app.unlink_task_message($1,$2,$3)',[family,task,version]);return {sources:[]};
  },true);}
  workSources(actor:string,family:string,kind:'task'|'event',id:string):Promise<MessageSourcePageDto>{
    return this.run(actor,family,async(client)=>{
      const sourcePath=(channel:string,message:string)=>'/message/?'+new URLSearchParams({family,conversation:channel,id:message});
      if(kind==='task'){
        const {rows:[task]}=await client.query<{source:string|null;author:string;version:number}>('select source_message_id as source,author_id as author,version from app.tasks where id=$1 and family_id=$2',[id,family]);
        if(!task)throw new NotFoundException('Task not found.');if(!task.source)return {sources:[]};
        const {rows:[source]}=await client.query<{channel:string;body:string}>('select channel_id as channel,case when deleted_at is not null then $2 when body=$3 then $4 else left(body,180) end as body from app.channel_messages where id=$1',[task.source,'Message deleted','','Attachment']);
        return {sources:[{available:!!source,label:source?.body??'Source unavailable',path:source?sourcePath(source.channel,task.source):null,canUnlink:task.author===actor,version:task.version}]};
      }
      if(!(await client.query('select 1 from app.calendar_events where id=$1 and family_id=$2',[id,family])).rowCount)throw new NotFoundException('Event not found.');
      const {rows}=await client.query<{channel:string|null;message:string|null;body:string|null}>(`select m.channel_id as channel,m.id as message,coalesce(nullif(left(m.body,180),''),'Attachment') as body
        from app.message_event_links l left join app.channel_messages m on m.id=l.message_id where l.event_id=$1`,[id]);
      return {sources:rows.map(row=>({available:!!row.message,label:row.body??'Source unavailable',path:row.message?sourcePath(row.channel!,row.message):null,canUnlink:false,version:0}))};
    });
  }
  private cursor(value:string):[string,string]{
    let decoded:unknown;try{decoded=JSON.parse(Buffer.from(value,'base64url').toString());}catch{throw new BadRequestException('Invalid page cursor.');}
    const parsed=z.tuple([z.string().max(64),z.uuid()]).safeParse(decoded);
    if(!parsed.success||!Number.isFinite(Date.parse(parsed.data[0])))throw new BadRequestException('Invalid page cursor.');return parsed.data;
  }
  private encode(date:string,id:string){return Buffer.from(JSON.stringify([date,id])).toString('base64url');}
  private async message(client:PoolClient,actor:string,channel:string,id:string,context:Context) {
    const {rows:[row]}=await client.query<MessageRow>(`select ${messageFields} from ${messageSource} where m.channel_id=$1 and m.id=$3`,[channel,actor,id]);
    if(!row) throw new NotFoundException('Message not found.');return toMessage(row,context);
  }
  private async detail(client:PoolClient,actor:string,family:string,id:string,context:Context):Promise<ChannelDetailDto> {
    const {rows:[row]}=await client.query<ChannelRow>(`select ${channelFields} from ${channelSource} where c.family_id=$1 and c.id=$3`,[family,actor,id]);
    if(!row) throw new NotFoundException('Channel not found.');
    const {rows:members}=await client.query<{id:string;admin:boolean;joinedPosition:number;deliveredPosition:number;readPosition:number|null;online:boolean|null;lastSeen:Date|null}>(`select p.user_id as id,app.is_channel_admin(p.channel_id,p.user_id) as admin,
      s.joined_position as "joinedPosition",s.delivered_position as "deliveredPosition",s.read_position as "readPosition",s.online,s.last_seen as "lastSeen"
      from app.channel_participants p join app.conversation_status($1) s on s.user_id=p.user_id where p.channel_id=$1 order by p.joined_at,p.user_id`,[id]);
    const {rows:pins}=await client.query<{id:string;body:string;authorId:string|null;fileCount:number;attachment:AttachmentKind|null}>(`select m.id,${attachmentOf('m')} as attachment,left(m.body,160) as body,m.author_id as "authorId",(select count(*)::int from app.message_file_links l where l.message_id=m.id) as "fileCount"
      from app.message_pins pin join app.channel_messages m on m.id=pin.message_id where m.channel_id=$1 and m.deleted_at is null order by pin.created_at desc`,[id]);
    return {...toChannel(row,actor,context),members:members.map(({id:user,lastSeen,...member})=>({...person(user,context.names)!,guest:context.guests.has(user),...member,lastSeen:lastSeen?.toISOString()??null})),
      pins:pins.map(({authorId,...pin})=>({...pin,author:person(authorId,context.names)}))};
  }
}
