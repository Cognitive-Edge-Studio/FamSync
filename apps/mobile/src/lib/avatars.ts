import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createAvatarCache, isPersonId } from '@famsync/core/avatars';
import { getApi, required } from './api';
import { getAuth } from './auth';
import { useSession } from './session';

const caches=new Map<string,ReturnType<typeof createAvatarCache>>();
function cacheFor(viewer:string) {
  let cache=caches.get(viewer);
  if(!cache) {
    cache=createAvatarCache(async userIds=>{
      const {data:{session}}=await getAuth().getSession();
      if(session?.user.id!==viewer)throw Error('Session changed');
      return required(await getApi(session.access_token).POST('/api/v1/avatars/resolve',{body:{userIds}})).avatars;
    });caches.set(viewer,cache);
  }
  return cache;
}
export function invalidateAvatar(id:string){caches.forEach(cache=>cache.invalidate(id));}
export function useAvatarUrl(id:string) {
  const {state}=useSession(),viewer=state.status==='signedIn'?state.session.user.id:null;
  const [image,setImage]=useState<{viewer:string;id:string;url:string|null}|null>(null);
  useEffect(()=>{
    if(!viewer){caches.forEach(cache=>cache.clear());caches.clear();return;}
    if(!isPersonId(id))return;
    const cache=cacheFor(viewer),update=()=>setImage({viewer,id,url:cache.get(id)});
    update();const stop=cache.subscribe(id,update);
    const refresh=()=>{update();cache.refresh(id);};
    const timer=setInterval(refresh,30_000),app=AppState.addEventListener('change',next=>{if(next==='active')refresh();});
    return ()=>{stop();clearInterval(timer);app.remove();};
  },[viewer,id]);
  return image?.viewer===viewer&&image?.id===id?image.url:null;
}
