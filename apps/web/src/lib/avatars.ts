"use client";
import { useEffect, useState } from 'react';
import { createAvatarCache, isPersonId } from '@famsync/core/avatars';
import { getBrowserApi, getBrowserAuth } from './browser-auth';

const caches=new Map<string,ReturnType<typeof createAvatarCache>>();
function cacheFor(viewer:string) {
  let cache=caches.get(viewer);
  if(!cache) {
    cache=createAvatarCache(async userIds=>{
      const {data:{session}}=await getBrowserAuth().getSession();
      if(session?.user.id!==viewer) throw Error('Session changed');
      const {data}=await getBrowserApi(session.access_token).POST('/api/v1/avatars/resolve',{body:{userIds}});
      if(!data) throw Error('Avatars unavailable');
      return data.avatars;
    });
    caches.set(viewer,cache);
  }
  return cache;
}
export function invalidateAvatar(id:string) { caches.forEach(cache=>cache.invalidate(id)); }
export function useAvatarUrl(id:string,enabled=true) {
  const [state,setState]=useState<{id:string;url:string|null}>({id,url:null});
  useEffect(()=>{
    if(!enabled||!isPersonId(id)) return;
    let stopped=false,unsubscribe=()=>{},interval:ReturnType<typeof setInterval>|undefined;
    function attach(viewer?:string) {
      unsubscribe();if(interval)clearInterval(interval);
      if(stopped)return;
      if(!viewer) { caches.forEach(cache=>cache.clear());caches.clear();setState({id,url:null});return; }
      const cache=cacheFor(viewer),update=()=>{if(!stopped)setState({id,url:cache.get(id)});};
      update();unsubscribe=cache.subscribe(id,update);
      interval=setInterval(()=>{update();cache.refresh(id);},30_000);
    }
    const auth=getBrowserAuth(),subscription=auth.onAuthStateChange((_event,session)=>attach(session?.user.id)).data.subscription;
    void auth.getSession().then(({data:{session}})=>attach(session?.user.id)).catch(()=>{});
    return ()=>{stopped=true;unsubscribe();if(interval)clearInterval(interval);subscription.unsubscribe();};
  },[id,enabled]);
  return enabled&&state.id===id?state.url:null;
}
