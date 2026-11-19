"use client";
import type {Session} from '@supabase/auth-js';
import type {components} from '@famsync/api-client';
import {useEffect,useState} from 'react';
import {getBrowserApi} from '@/lib/browser-auth';
import {useChannelUpdates} from '@/lib/channel-updates';
import {AppShell} from './app-shell';
import {FamilySession} from './family-session';
import {FormFeedback} from './account-fields';
import {Button} from './ui/button';
import {EmptyState} from './ui/empty-state';
import {PageHeader} from './ui/page-header';
import {LiveStatus} from './ui/live-status';
export const guestChannelPath=(family:string,id:string)=>'/guest-channel/?'+new URLSearchParams({family,id});
function Workspace({session}:{session:Session}){
 const [rows,setRows]=useState<components['schemas']['GuestWorkspaceDto'][]>([]),[pages,setPages]=useState(1),[next,setNext]=useState<string|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const connection=useChannelUpdates(session.user.id,rows.map(c=>c.id),()=>setRevision(v=>v+1));
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');async function load(){try{const items:typeof rows=[];let cursor:string|undefined,last:string|null=null;for(let n=0;n<pages;n++){const r=await getBrowserApi(session.access_token).GET('/api/v1/guest-channels',{params:{query:{cursor,limit:20}},signal:c.signal});if(!r.data)throw Error();items.push(...r.data.channels);last=r.data.nextCursor;if(!last)break;cursor=last;}if(!c.signal.aborted){setRows(items);setNext(last);}}catch{if(!c.signal.aborted){setRows([]);setError('We couldn’t load your guest channels. Try again.');}}finally{if(!c.signal.aborted)setLoading(false);}}void load();return()=>c.abort();},[session.access_token,revision,pages]);
 return <><PageHeader title="Guest channels" description="Channels other families shared with you." />
 <FormFeedback error={error} note={loading?'Loading guest channels…':undefined} />
 {!loading&&!error&&!rows.length&&<EmptyState icon="guests" tone="peach" title="No active guest channels">Open a current invitation email to join one.</EmptyState>}
 {!!rows.length&&<ul aria-label="Your guest channels" className="grid gap-2 rounded-2xl border border-border bg-panel p-2">{rows.map(c=><li key={c.id}><a href={guestChannelPath(c.familyId,c.id)} className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent">
   <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-xl">{c.emoji}</span>
   <div className="min-w-0 grow"><h2 className={'truncate text-sm '+(c.unread?'font-semibold':'font-medium')}>{c.name}</h2><p className="truncate text-xs text-muted-foreground">{c.familyName}{c.archived?' · Archived':''}</p></div>
   {!!c.unread&&<span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground">{c.unread}<span className="sr-only"> unread</span></span>}</a></li>)}</ul>}
 {next&&<Button variant="outline" className="mt-4" disabled={loading} onClick={()=>setPages(p=>p+1)}>More guest channels</Button>}<LiveStatus state={connection} className="mt-3" /></>;
}
export function GuestWorkspaceScreen(){return <AppShell activePage="guests" guestMode><div className="mx-auto max-w-3xl pb-4"><FamilySession>{s=><Workspace key={s.user.id} session={s} />}</FamilySession></div></AppShell>;}
