import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import pg from 'pg';
import sharp from 'sharp';
import {DatabaseService} from '../dist/database.service.js';
import {StickersService} from '../dist/stickers.service.js';
import {AvatarsService} from '../dist/avatars.service.js';
import {FilesService} from '../dist/files.service.js';
import {ChannelsService} from '../dist/channels.service.js';

const admin=new pg.Pool({connectionString:process.env.ADMIN_DATABASE_URL??'postgresql://supabase_admin:famsync-local-admin@127.0.0.1:55432/postgres'}),workers=new pg.Pool({connectionString:process.env.JOBS_DATABASE_URL??'postgresql://famsync_jobs:famsync-local-jobs@127.0.0.1:55432/postgres'});
process.env.DATABASE_URL??='postgresql://famsync_api:famsync-local-runtime@127.0.0.1:55432/postgres';process.env.GEMINI_API_KEY='fixture';process.env.AVATAR_AI_ENABLED='true';process.env.FAMILY_AI_ENABLED='true';
const database=new DatabaseService(),users=Array.from({length:4},()=>randomUUID()),family=randomUUID(),channel=randomUUID(),target=randomUUID(),avatarId=randomUUID();
const data=new Map(),handlers=new Map();
const sheet=await sharp({create:{width:600,height:400,channels:3,background:'#ff00ff'}}).composite(await Promise.all(Array.from({length:6},async(_,i)=>({input:await sharp({create:{width:84,height:116,channels:3,background:'#406080'}}).png().toBuffer(),left:(i%3)*200+58,top:Math.floor(i/3)*200+42})))).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toBuffer();
let requests=0,temporary=false;
const provider=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);assert.equal(body.store,false);requests++;res.setHeader('Content-Type','application/json');if(temporary){res.writeHead(503);res.end('{}');return;}res.end(JSON.stringify({status:'completed',steps:[{type:'model_output',content:[{type:'image',data:sheet.toString('base64')}]}]}));});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));process.env.GEMINI_BASE_URL='http://127.0.0.1:'+provider.address().port;
const storage={configured:true,uploadFile:async(key,bytes)=>data.set(key,bytes),readFile:async key=>{assert.ok(data.has(key),'stored bytes exist');return data.get(key);},readOptionalFile:async key=>data.get(key)??null,discard:async key=>data.delete(key),removeFile:async key=>data.delete(key),openFile:async(key,fileName)=>{assert.ok(data.has(key));return{url:'https://private.example.test/'+key,expiresAt:new Date(Date.now()+60_000).toISOString(),fileName};}};
const jobs={register:(kind,handler)=>handlers.set(kind,handler),notify:async()=>{}},jobDatabase={configured:true};
const files=new FilesService(database,storage,jobs),stickers=new StickersService(database,storage,jobs,jobDatabase,files),avatars=new AvatarsService(database,storage,jobs,jobDatabase);
const channels=new ChannelsService(database,jobs,{},files,jobDatabase,{}, {onMessage:async()=>{}});stickers.onModuleInit();
const run=async(kind,packId,attempts=1)=>{const client=await workers.connect();try{await handlers.get(kind)(client,{payload:{actorId:users[0],packId},attempts});}finally{client.release();}};
await admin.query("insert into auth.users(id,email,email_confirmed_at) select id,id::text||'@stickers.example.test',now() from unnest($1::uuid[]) id",[users]);
await admin.query("insert into app.families(id,name) values($1,'Sticker fixture')",[family]);
await admin.query("insert into app.family_memberships(family_id,user_id,role) values($1,$2,'owner'),($1,$3,'member'),($1,$4,'member')",[family,users[0],users[1],users[2]]);
await admin.query("insert into app.channels(id,family_id,name,author_id,manager_id) values($1,$3,'Sticker source',$4,$4),($2,$3,'Sticker forward',$4,$4)",[channel,target,family,users[0]]);
await admin.query('insert into app.channel_participants(channel_id,family_id,user_id) select c,$1,u from unnest($2::uuid[]) c cross join unnest($3::uuid[]) u',[family,[channel,target],[users[0],users[1]]]);
await admin.query("insert into app.avatar_generations(id,user_id,input_hash,status) values($1,$2,'fixture','ready')",[avatarId,users[0]]);
await admin.query('insert into app.profiles(user_id,avatar_generation_id) values($1,$2)',[users[0],avatarId]);
data.set(`avatars/${users[0]}/${avatarId}/avatar.webp`,await sharp({create:{width:64,height:64,channels:3,background:'#406080'}}).webp().toBuffer());
after(async()=>{
  provider.close();
  await admin.query('delete from app.families where id=$1',[family]);await admin.query('delete from auth.users where id=any($1)',[users]);
  await admin.query("delete from app.outbox where family_id=$1 or payload->>'actorId'=any($2)",[family,users]);
  await database.onModuleDestroy();await Promise.all([admin.end(),workers.end()]);
});
let packId,sentFile,message;
test('one pack per current avatar, temporary retries, and private pack access',async()=>{
  const [first,second]=await Promise.all([stickers.create(users[0],randomUUID()),stickers.create(users[0],randomUUID())]);packId=first.pack.id;assert.equal(second.pack.id,packId);
  assert.equal((await admin.query("select count(*)::int as n from app.outbox where kind='stickers.generate' and payload->>'packId'=$1",[packId])).rows[0].n,1);
  assert.equal((await stickers.status(users[1])).pack,null);
  await assert.rejects(stickers.create(users[1],randomUUID()),error=>error.getStatus()===400);
  temporary=true;await assert.rejects(run('stickers.generate',packId));temporary=false;
  await run('stickers.generate',packId,2);await run('stickers.generate',packId,3);
  assert.equal(requests,2);const ready=await stickers.status(users[0]);assert.equal(ready.pack.status,'ready');assert.equal(ready.stickers.length,6);
  const hidden=await database.withActor(users[1],client=>client.query('select 1 from app.avatar_sticker_packs where id=$1',[packId]));assert.equal(hidden.rowCount,0);
});
test('prepare and retry copy one sticker into an authorized conversation only',async()=>{
  const id=randomUUID();sentFile=await stickers.prepare(users[0],family,channel,packId,'wave',id);const retried=await stickers.prepare(users[0],family,channel,packId,'wave',id);
  assert.equal(retried.id,sentFile.id);assert.equal(retried.sticker,true);
  assert.equal((await stickers.prepare(users[0],family,channel,packId,'wave',randomUUID())).id,sentFile.id,'repeated sends reuse the conversation copy');
  await assert.rejects(stickers.prepare(users[1],family,channel,packId,'wave',randomUUID()),error=>error.getStatus()===404);
  await admin.query('update app.channels set archived_at=now() where id=$1',[channel]);
  await assert.rejects(stickers.prepare(users[0],family,channel,packId,'wave',randomUUID()),error=>error.getStatus()===404);
  await admin.query('update app.channels set archived_at=null where id=$1',[channel]);
  const forbidden=randomUUID();await assert.rejects(stickers.prepare(users[0],family,forbidden,packId,'wave',randomUUID()),error=>error.getStatus()===404);
  message=await channels.post(users[0],family,channel,{id:randomUUID(),body:'',fileIds:[sentFile.id]});
  assert.equal(message.files[0].sticker,true);assert.equal((await channels.history(users[1],family,channel,{})).messages[0].files[0].sticker,true);
  assert.equal((await files.preview(users[1],family,sentFile.id)).kind,'image');
  await assert.rejects(files.preview(users[2],family,sentFile.id),error=>[403,404].includes(error.getStatus()));
});
test('forwarding preserves sticker presentation and participant revocation ends file access',async()=>{
  const forward=await channels.forward(users[0],family,target,{id:randomUUID(),conversationId:channel,messageId:message.id});
  assert.equal(forward.forwarded,true);assert.equal(forward.files[0].sticker,true);assert.notEqual(forward.files[0].fileId,sentFile.id);
  await admin.query('delete from app.channel_participants where channel_id=$1 and user_id=$2',[channel,users[1]]);
  await assert.rejects(files.preview(users[1],family,sentFile.id),error=>[403,404].includes(error.getStatus()));
});
test('reset removes pack originals while sent conversation copies survive',async()=>{
  await avatars.reset(users[0]);await run('stickers.cleanup',packId);
  assert.equal((await stickers.status(users[0])).hasAvatar,false);
  assert.equal([...data.keys()].filter(key=>key.startsWith('stickers/')).length,0);
  assert.equal((await files.preview(users[0],family,sentFile.id)).kind,'image');
  await assert.rejects(stickers.prepare(users[0],family,channel,packId,'wave',randomUUID()),error=>error.getStatus()===404);
});
test('daily pack limits and explicit retry limits cannot be bypassed with new request IDs',async()=>{
  const actor=users[3],ids=Array.from({length:3},()=>randomUUID());let firstPack;
  for(let i=0;i<3;i++){
    await admin.query("insert into app.avatar_generations(id,user_id,input_hash,status) values($1,$2,'quota-fixture','ready')",[ids[i],actor]);
    await admin.query('insert into app.profiles(user_id,avatar_generation_id) values($1,$2) on conflict(user_id) do update set avatar_generation_id=$2',[actor,ids[i]]);
    if(i<2){const created=await stickers.create(actor,randomUUID());if(!i)firstPack=created.pack.id;}
    else await assert.rejects(stickers.create(actor,randomUUID()),error=>error.getStatus()===429);
  }
  await admin.query('update app.profiles set avatar_generation_id=$2 where user_id=$1',[actor,ids[0]]);
  await admin.query("update app.avatar_sticker_packs set status='failed' where id=$1",[firstPack]);
  assert.equal((await stickers.create(actor,randomUUID())).pack.id,firstPack);
  await admin.query("update app.avatar_sticker_packs set status='failed' where id=$1",[firstPack]);
  await assert.rejects(stickers.create(actor,randomUUID()),error=>error.getStatus()===400);
});
