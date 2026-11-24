"use client";
import { useEffect, useRef, useState } from 'react';
import { RealtimeClient } from '@supabase/realtime-js';
import { getBrowserAuth } from './browser-auth';

// Broadcasts carry no content. Fetch authoritative data after any signal or reconnect.
export function useChannelUpdates(userId:string,channelIds:string[],refresh:()=>void,onTyping?:(channelId:string,userId:string,active:boolean)=>void) {
  const latest=useRef(refresh);latest.current=refresh;
  const typing=useRef(onTyping);typing.current=onTyping;
  const [state,setState]=useState('Connecting to updates…');
  const key=channelIds.slice().sort().join(',');
  useEffect(()=>{
    const ids=key?key.split(','):[];
    const url=process.env.NEXT_PUBLIC_SUPABASE_REALTIME_URL;
    let active=true,timer:ReturnType<typeof setTimeout>|undefined;
    const signal=()=>{if(timer) return;timer=setTimeout(()=>{timer=undefined;if(active){latest.current();window.dispatchEvent(new Event('famsync:notifications'));}},200);};
    const focus=()=>{if(document.visibilityState==='visible')signal();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    // A periodic access/content check also recovers after a missed signal or a revoked subscription.
    const poll=setInterval(()=>{if(document.visibilityState==='visible')signal();},15000);
    let client:RealtimeClient|undefined;
    if(url&&ids.length) {
      client=new RealtimeClient(url,{params:{apikey:process.env.NEXT_PUBLIC_SUPABASE_REALTIME_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||''},
        accessToken:async()=> (await getBrowserAuth().getSession()).data.session?.access_token??null});
      const connected=new Set<string>(),realtime=client;
      // Resolve the user's token before the first join; otherwise a fast socket may join as anon.
      void realtime.setAuth().then(()=>{
        if(!active)return;
        for(const id of ids) realtime.channel('famsync:channel:'+id+':'+userId,{config:{private:true}})
          .on('broadcast',{event:'refresh'},signal)
          .on('broadcast',{event:'typing'},({payload})=>{if(active&&typeof payload?.userId==='string')typing.current?.(id,payload.userId,payload.active===true);}).subscribe(status=>{
            if(!active)return;
            if(status==='SUBSCRIBED'){connected.add(id);signal();}
            else connected.delete(id);
            setState(connected.size===ids.length?'Live updates connected':'Reconnecting… You can refresh manually.');
          });
      }).catch(()=>{if(active)setState('Reconnecting… You can refresh manually.');});
    } else setState(url&&!ids.length?'Updates will connect when a conversation opens.':'Live updates unavailable. Refresh to check for changes.');
    return ()=>{active=false;if(timer)clearTimeout(timer);clearInterval(poll);window.removeEventListener('focus',focus);
      document.removeEventListener('visibilitychange',focus);void client?.removeAllChannels();client?.disconnect();};
  },[userId,key]);
  return state;
}
