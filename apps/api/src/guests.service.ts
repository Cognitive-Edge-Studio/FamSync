import {randomUUID} from 'node:crypto';
import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import type {PoolClient} from 'pg';
import {DatabaseService} from './database.service.js';
import {JobsService} from './jobs.service.js';
import {invitationToken,tokenDigest} from './invitation-token.js';
import type {GuestEntryDto,GuestEntryPageDto,GuestPolicyDto,GuestWorkspaceDto,GuestWorkspacePageDto} from './guests.dto.js';
const entryFields=`select i.id,'invitation'::text as kind,i.channel_id as "channelId",app.guest_channel_name(i.channel_id) as "channelName",i.email,
 case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at<=clock_timestamp() then 'expired' else 'pending' end as status,
 i.delivery_status as "deliveryStatus",i.expires_at as "expiresAt",i.created_at as "createdAt",i.created_at::text as sort_date,'i:'||i.id::text as sort_key
 from app.channel_guest_invitations i where i.family_id=$1 and ($2::uuid is null or i.channel_id=$2)
 union all select g.user_id,'grant',g.channel_id,app.guest_channel_name(g.channel_id),g.email,case when g.revoked_at is null then 'active' else 'revoked' end,
 null::text,null::timestamptz,g.granted_at,g.granted_at::text,'g:'||g.channel_id::text||':'||g.user_id::text
 from app.channel_guest_grants g where g.family_id=$1 and ($2::uuid is null or g.channel_id=$2)`;
@Injectable()
export class GuestsService{
 constructor(private readonly database:DatabaseService,private readonly jobs:JobsService){}
 private async run<T>(actor:string,work:(client:PoolClient)=>Promise<T>,write=false){try{const result=await this.database.withActor(actor,work);if(write)await this.jobs.notify();return result;}catch(e){const code=(e as{code?:string}).code;if(code==='42501')throw new ForbiddenException((e as Error).message);if(code==='P0002')throw new NotFoundException('Guest invitation or access not found.');if(code==='23505')throw new ConflictException('An invitation already exists. Refresh the list and use Resend.');if(code==='40001'||code==='40P01')throw new ConflictException('Guest access changed. Reload before trying again.');if(['22023','23514','22P02'].includes(code??''))throw new BadRequestException(code==='22023'?(e as Error).message:'Check the guest invitation details.');throw e;}}
 policy(actor:string,family:string){return this.run(actor,client=>this.readPolicy(client,family));}
 private async readPolicy(client:PoolClient,family:string){const {rows:[row]}=await client.query<GuestPolicyDto>('select channel_guests_allowed as allowed,guest_policy_version as version from app.families where id=$1',[family]);if(!row)throw new NotFoundException('Family workspace not found.');return row;}
 setPolicy(actor:string,family:string,input:GuestPolicyDto){return this.run(actor,async client=>{await client.query('select app.set_channel_guest_policy($1,$2,$3)',[family,input.allowed,input.version]);return this.readPolicy(client,family);},true);}
 private async authorize(client:PoolClient,family:string,channel?:string){
  if(channel){const {rows:[r]}=await client.query<{ok:boolean}>('select app.is_guest_admin($1) and exists(select 1 from app.families where id=$2) as ok',[channel,family]);
   // The name function may bypass content visibility for owners; still bind the channel to this family.
   const {rows:[bound]}=await client.query<{ok:boolean}>('select exists(select 1 from app.channel_guest_invitations where family_id=$1 and channel_id=$2) or exists(select 1 from app.channel_guest_grants where family_id=$1 and channel_id=$2) or exists(select 1 from app.channels where id=$2 and family_id=$1) as ok',[family,channel]);
   if(!r.ok||!bound.ok)throw new ForbiddenException('Only the channel manager or family owner can manage guests.');
  }else if(!(await client.query("select 1 from app.family_memberships where family_id=$1 and user_id=app.actor_id() and role='owner'",[family])).rowCount)throw new ForbiddenException('Only the family owner can view all guest access.');
 }
 list(actor:string,family:string,query:{channelId?:string;cursor?:string;limit?:number}):Promise<GuestEntryPageDto>{return this.run(actor,async client=>{
  await this.authorize(client,family,query.channelId);let cursor:[string,string]|null=null;
  if(query.cursor){try{const c=JSON.parse(Buffer.from(query.cursor,'base64url').toString());if(!Array.isArray(c)||c.length!==2||typeof c[0]!=='string'||!Number.isFinite(Date.parse(c[0]))||typeof c[1]!=='string'||c[1].length>100)throw Error();cursor=c as [string,string];}catch{throw new BadRequestException('Invalid guest page cursor.');}}
  const limit=query.limit??30;const {rows}=await client.query<GuestEntryDto&{sort_date:string;sort_key:string}>(`select * from (${entryFields}) entries where ($3::timestamptz is null or ("createdAt",sort_key)<($3::timestamptz,$4::text)) order by "createdAt" desc,sort_key desc limit $5`,[family,query.channelId??null,cursor?.[0]??null,cursor?.[1]??null,limit+1]);
  const page=rows.slice(0,limit),last=page.at(-1);return{entries:page.map(({sort_date,sort_key,...r})=>r),nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify([last.sort_date,last.sort_key])).toString('base64url'):null};
 });}
 invite(actor:string,family:string,channel:string,input:{id:string;email:string}){return this.run(actor,async client=>{const attempt=randomUUID();await client.query('select app.invite_channel_guest($1,$2,$3,$4,$5,$6)',[family,channel,input.id,input.email,tokenDigest(invitationToken(attempt)),attempt]);return{id:input.id};},true);}
 resend(actor:string,family:string,channel:string,id:string){return this.run(actor,async client=>{const attempt=randomUUID();await client.query('select app.resend_channel_guest($1,$2,$3,$4,$5)',[family,channel,id,tokenDigest(invitationToken(attempt)),attempt]);return{id};},true);}
 revoke(actor:string,family:string,channel:string,id:string,kind:'invitation'|'grant'){return this.run(actor,async client=>{await client.query('select app.revoke_channel_guest($1,$2,$3,$4)',[family,channel,id,kind]);return{id};},true);}
 accept(actor:string,token:string){return this.run(actor,async client=>{const {rows:[r]}=await client.query<{familyId:string;channelId:string}>('select family_id as "familyId",channel_id as "channelId" from app.accept_channel_guest($1)',[tokenDigest(token)]);if(!r)throw new NotFoundException('This channel invitation is unavailable for your account. Check the invited email, expiry, and current guest policy.');return r;},true);}
 workspaces(actor:string,query:{cursor?:string;limit?:number}):Promise<GuestWorkspacePageDto>{return this.run(actor,async client=>{const limit=query.limit??30;const {rows}=await client.query<GuestWorkspaceDto>(`select c.id,w.family_id as "familyId",w.family_name as "familyName",c.name,c.emoji,c.archived_at is not null as archived,
 (select count(*)::int from app.channel_messages m where m.channel_id=c.id and m.position>p.last_read and m.author_id is distinct from app.actor_id() and m.deleted_at is null) as unread
 from app.guest_workspaces() w join app.channels c on c.id=w.channel_id join app.channel_participants p on p.channel_id=c.id and p.user_id=app.actor_id()
 where ($1::uuid is null or c.id>$1) order by c.id limit $2`,[query.cursor??null,limit+1]);const page=rows.slice(0,limit);return{channels:page,nextCursor:rows.length>limit?page.at(-1)!.id:null};});}
}
