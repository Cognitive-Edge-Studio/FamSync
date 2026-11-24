"use client";
import {useEffect,useState,type FormEvent} from 'react';
import type {components} from '@famsync/api-client';
import {getBrowserApi} from '@/lib/browser-auth';
import {chatMessagePath} from '@/lib/channels';
import {Field,FormFeedback,inputClass} from './account-fields';
import {Button} from './ui/button';
import {ChevronDown} from 'lucide-react';
export function MessageSearch({familyId,accessToken,conversationId,compact=false,guest=false}:{familyId:string;accessToken:string;conversationId?:string;compact?:boolean;guest?:boolean}){
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null);
 const [rows,setRows]=useState<components['schemas']['MessageSearchItemDto'][]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!search)return;const c=new AbortController();setLoading(true);setError('');void getBrowserApi(accessToken).GET('/api/v1/families/{familyId}/channels/message-search',{
  params:{path:{familyId},query:{q:search,conversationId,cursor:cursor??undefined,limit:20}},signal:c.signal,
 }).then(({data})=>{if(c.signal.aborted)return;if(!data)throw new Error();setRows(old=>cursor?[...new Map([...old,...data.messages].map(m=>[m.id,m])).values()]:data.messages);setNext(data.nextCursor);})
  .catch(()=>{if(!c.signal.aborted){setRows([]);setError('We couldn’t search messages. Try again.');}}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[familyId,accessToken,conversationId,search,cursor,revision]);
 function submit(e:FormEvent){e.preventDefault();if(!query.trim())return;setCursor(null);setRows([]);setSearch(query.trim());setRevision(v=>v+1);}
 return <details className={compact?'group border-t border-border pt-1':'mt-5 rounded-xl border border-border bg-panel p-4'}><summary className={compact?'flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden':'cursor-pointer font-semibold'}>Search messages{compact&&<ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />}</summary>
  <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={submit}><div className="min-w-0 grow"><Field id={'message-search-'+(conversationId??'all')} label={conversationId?'Search this conversation':'Search accessible messages'}>
   <input id={'message-search-'+(conversationId??'all')} className={inputClass} required maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} /></Field></div><Button type="submit" variant="outline" disabled={loading||!query.trim()}>Find messages</Button></form>
  <FormFeedback error={error} note={loading?'Searching messages…':undefined} />
  {error&&<Button variant="outline" onClick={()=>setRevision(v=>v+1)}>Retry search</Button>}
  {search&&!loading&&!error&&rows.length===0&&<p className="mt-3 text-sm text-muted-foreground">No matching messages.</p>}
  <ul aria-label="Message search results" className="mt-3 grid gap-2">{rows.map(m=><li key={m.id}><a href={chatMessagePath(familyId,m.conversationId,m.id,guest?'guest':m.conversationKind)} className="block rounded-xl bg-background p-3">
   <p className="text-xs text-muted-foreground">{m.conversationName} · {m.author?.name??'Former member'}</p><p className="mt-1 wrap-anywhere whitespace-pre-wrap text-sm">{m.body.slice(0,240)}</p></a></li>)}</ul>
  {next&&<Button className="mt-3" variant="outline" disabled={loading} onClick={()=>setCursor(next)}>More message results</Button>}
 </details>;
}
