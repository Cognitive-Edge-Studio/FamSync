import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAvatarCache} from '../../../packages/core/src/avatars.ts';
const id='a0000000-0000-4000-8000-000000000001',other='a0000000-0000-4000-8000-000000000002';
const pause=()=>new Promise(resolve=>setTimeout(resolve,45));
test('mounted portraits batch, deduplicate and cache missing avatars',async()=>{
  const calls:string[][]=[];const cache=createAvatarCache(async ids=>{calls.push(ids);return[{userId:id,url:'https://avatar.test/one',expiresAt:new Date(Date.now()+60_000).toISOString()}];});
  const stops=[cache.subscribe(id,()=>{}),cache.subscribe(id,()=>{}),cache.subscribe(other,()=>{}),cache.subscribe('demo-person',()=>{})];
  await pause();assert.deepEqual(calls,[[id,other]]);assert.equal(cache.get(id),'https://avatar.test/one');assert.equal(cache.get(other),null);
  cache.refresh(id);cache.refresh(other);await pause();assert.equal(calls.length,1);stops.forEach(stop=>stop());cache.clear();
});
test('clearing a viewer discards an in-flight private URL',async()=>{
  let finish:(value:{userId:string;url:string;expiresAt:string}[])=>void=()=>{};
  const cache=createAvatarCache(()=>new Promise(resolve=>{finish=resolve;}));const stop=cache.subscribe(id,()=>{});await pause();cache.clear();
  finish([{userId:id,url:'https://avatar.test/private',expiresAt:new Date(Date.now()+60_000).toISOString()}]);await pause();assert.equal(cache.get(id),null);stop();
});
test('saving during an in-flight lookup cannot restore the previous portrait',async()=>{
  let finish:(value:{userId:string;url:string;expiresAt:string}[])=>void=()=>{},calls=0;
  const cache=createAvatarCache(async()=>{calls++;if(calls===1)return new Promise(resolve=>{finish=resolve;});return[{userId:id,url:'https://avatar.test/new',expiresAt:new Date(Date.now()+60_000).toISOString()}];});
  const stop=cache.subscribe(id,()=>{});await pause();cache.invalidate(id);finish([{userId:id,url:'https://avatar.test/old',expiresAt:new Date(Date.now()+60_000).toISOString()}]);await pause();assert.equal(cache.get(id),'https://avatar.test/new');stop();cache.clear();
});
