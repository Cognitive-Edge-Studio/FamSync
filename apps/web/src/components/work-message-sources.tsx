"use client";
import {useEffect,useState} from 'react';
import type {components} from '@famsync/api-client';
import {getBrowserApi} from '@/lib/browser-auth';
import {FormFeedback} from './account-fields';
import {familyError} from './family-session';
import {Button} from './ui/button';
export function WorkMessageSources({accessToken,familyId,kind,id}:{accessToken:string;familyId:string;kind:'task'|'event';id:string}){
 const [sources,setSources]=useState<components['schemas']['MessageSourceDto'][]>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')setRevision(v=>v+1);};const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
 useEffect(()=>{const c=new AbortController();void getBrowserApi(accessToken).GET('/api/v1/families/{familyId}/channels/work-sources',{
  params:{path:{familyId},query:{kind,id}},signal:c.signal,
 }).then(({data,response})=>{if(c.signal.aborted)return;if(data){setSources(data.sources);setError('');}else {setSources([]);if(response.status!==404)setError('We couldn’t check linked messages.');}})
  .catch(()=>{if(!c.signal.aborted){setSources([]);setError('We couldn’t check linked messages.');}});return()=>c.abort();},[accessToken,familyId,kind,id,revision]);
 async function unlink(version:number){setBusy(true);setError('');try{
  const {data,error}=await getBrowserApi(accessToken).DELETE('/api/v1/families/{familyId}/channels/task-sources/{taskId}',{params:{path:{familyId,taskId:id}},body:{version}});
  if(data)window.location.reload();else setError(familyError(error,'We couldn’t unlink this source. Refresh and try again.'));
 }catch{setError('We couldn’t unlink this source. Try again.');}finally{setBusy(false);}}
 if(!sources.length&&!error)return null;
 return <section className="grid gap-3 border-t border-border pt-5"><h2 className="font-semibold">Source messages</h2><FormFeedback error={error} />
  {error&&<Button variant="outline" onClick={()=>setRevision(v=>v+1)}>Retry sources</Button>}
  {sources.map((source,index)=><div key={source.path??index} className="flex min-w-0 flex-wrap items-start justify-between gap-2 rounded-xl bg-background p-3">
   {source.path?<a className="min-w-0 flex-1 wrap-anywhere text-sm text-primary underline underline-offset-4" href={source.path}>{source.label}</a>:<p className="text-sm text-muted-foreground">Source unavailable</p>}
   {source.canUnlink&&<Button variant="outline" className="h-9 px-3" disabled={busy} onClick={()=>void unlink(source.version)}>Unlink source</Button>}
  </div>)}
 </section>;
}
