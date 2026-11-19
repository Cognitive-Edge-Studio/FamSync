"use client";
import { takeCreateRequest } from "@/lib/quick-create";
import type { Session } from '@supabase/auth-js';
import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { getBrowserApi } from '@/lib/browser-auth';
import { channelPath, type Channel } from '@/lib/channels';
import { useChannelUpdates } from '@/lib/channel-updates';
import { cn } from '@/lib/utils';
import { AppShell } from './app-shell';
import { FamilySession } from './family-session';
import { ScheduleFamily } from './schedule-family';
import { FormFeedback, inputClass } from './account-fields';
import { ChannelFormDialog } from './channel-form-dialog';
import { Button } from './ui/button';
import {OpenDirectDialog} from './open-direct-dialog';
import {MessageSearch} from './message-search';
import {ChannelAvatar} from './channel-image';
import { EmptyState } from './ui/empty-state';
import { LiveStatus } from './ui/live-status';

// The conversation list. As a page it is the whole screen on phones; as a pane it sits beside an open conversation.
export function ConversationList({session,familyId,direct=false,activeId,pane=false}:{session:Session;familyId:string;direct?:boolean;activeId?:string;pane?:boolean}) {
  const [channels,setChannels]=useState<Channel[]>([]),[query,setQuery]=useState(''),[search,setSearch]=useState('');
  const [archived,setArchived]=useState(false),[pages,setPages]=useState(1),[next,setNext]=useState<string|null>(null);
  const [revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[creating,setCreating]=useState(()=>!pane&&takeCreateRequest(direct?"dm":"channel"));
  const connection=useChannelUpdates(session.user.id,channels.map(c=>c.id),()=>setRevision(v=>v+1));
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    async function load(){
      try {
        const loaded:Channel[]=[];let cursor:string|undefined,nextCursor:string|null=null;
        for(let page=0;page<pages;page++){
          const {data}=await getBrowserApi(session.access_token).GET('/api/v1/families/{familyId}/channels',{
            params:{path:{familyId},query:{kind:direct?'dm':'channel',q:search||undefined,archived:String(archived) as 'true'|'false',cursor}},signal:controller.signal,
          });
          if(controller.signal.aborted)return;if(!data)throw new Error();
          loaded.push(...data.channels);nextCursor=data.nextCursor;if(!nextCursor)break;cursor=nextCursor;
        }
        if(!controller.signal.aborted){setChannels([...new Map(loaded.map(c=>[c.id,c])).values()]);setNext(nextCursor);}
      }catch{if(!controller.signal.aborted){setChannels([]);setError('We couldn’t load your conversations. Try again.');}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();
    return ()=>controller.abort();
  },[session.access_token,familyId,direct,search,archived,pages,revision]);
  // Search as you type, after a short pause.
  useEffect(()=>{const next=query.trim();if(next===search)return;const timer=setTimeout(()=>{setPages(1);setChannels([]);setSearch(next);},250);return ()=>clearTimeout(timer);},[query,search]);
  const title=direct?'Direct messages':'Channels',searchId=pane?'pane-channels-search':'channels-search';
  return <div className="flex min-h-0 flex-col">
    <div className="grid gap-3 border-b border-border p-4">
      <div className="flex items-center justify-between gap-2">
        {pane?<h2 className="text-base font-semibold">{title}</h2>:<h1 className="text-xl font-semibold">{title}</h1>}
        <Button size="icon" aria-label={direct?'New direct message':'New channel'} title={direct?'New direct message':'New channel'} onClick={()=>setCreating(true)}><Plus aria-hidden="true" /></Button>
      </div>
      <form className="flex items-center gap-2" onSubmit={e=>e.preventDefault()} role="search">
        <label htmlFor={searchId} className="sr-only">{direct?'Find a person':'Find a channel'}</label>
        <div className="relative min-w-0 grow"><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id={searchId} className={inputClass+' pl-9'} placeholder={direct?'Find a person':'Find a channel'} maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} /></div>
      </form>
      {!direct&&<Button variant="ghost" className="justify-self-start px-2 text-xs" aria-pressed={archived} onClick={()=>{setArchived(v=>!v);setPages(1);setChannels([]);}}>{archived?'Show active':'Show archived'}</Button>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <FormFeedback error={error} note={loading&&!channels.length?'Loading conversations…':undefined} />
      {error&&<Button variant="outline" className="m-2" onClick={()=>setRevision(v=>v+1)}>Try again</Button>}
      {!loading&&!error&&channels.length===0&&<p className="m-2 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{search?'No conversations match your search.':direct?'No direct messages yet. Choose a family member to start.':archived?'No archived channels.':'No channels yet. Create one and choose its members.'}</p>}
      <ul className="grid gap-0.5" aria-label={direct?'Your direct messages':'Your channels'}>{channels.map(channel=><li key={channel.id}>
        <a aria-current={channel.id===activeId?'page':undefined} className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-muted" href={channelPath(familyId,channel.id,channel.kind)}>
          <ChannelAvatar familyId={familyId} channelId={channel.id} imageFileId={channel.imageFileId} emoji={channel.emoji} accessToken={session.access_token}/>
          <div className="min-w-0 grow">
            {pane?<h3 className={cn('truncate text-sm',channel.unread>0?'font-semibold':'font-medium')}>{channel.name}</h3>:<h2 className={cn('truncate text-sm',channel.unread>0?'font-semibold':'font-medium')}>{channel.name}</h2>}
            <p className="truncate text-xs text-muted-foreground">{channel.topic||(direct?'Direct conversation':channel.memberCount+' members')}{channel.archived?' · Archived':''}{channel.muted?' · Muted':''}</p>
          </div>
          {channel.unread>0&&<span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground" aria-label={channel.unread+' unread messages'}>{channel.unread}</span>}
        </a></li>)}</ul>
      {next&&<Button className="m-2" variant="outline" disabled={loading} onClick={()=>setPages(v=>v+1)}>Load more channels</Button>}
      <LiveStatus state={connection} className="px-2.5 pt-3" />
    </div>
    {creating&&(direct?<OpenDirectDialog familyId={familyId} accessToken={session.access_token} userId={session.user.id} onClose={()=>setCreating(false)} />:<ChannelFormDialog familyId={familyId} accessToken={session.access_token} userId={session.user.id} onClose={()=>setCreating(false)} />)}
  </div>;
}

// Shared frame for the chat workspace: one bordered panel that fills the screen height on larger screens.
export const workspaceFrame='mt-4 overflow-hidden rounded-2xl border border-border bg-panel sm:mt-6 lg:h-[calc(100svh-10.5rem)] lg:min-h-[32rem]';

function ChannelsWorkspace({session,familyId,direct}:{session:Session;familyId:string;direct:boolean}){
  return <>
    <div className={cn(workspaceFrame,'grid lg:grid-cols-[20rem_minmax(0,1fr)]')}>
      <div className="min-h-0 lg:border-r lg:border-border"><ConversationList session={session} familyId={familyId} direct={direct} /></div>
      <div className="hidden place-items-center p-8 lg:grid">
        <EmptyState icon={direct?"messages":"channels"} tone="lavender" title={direct?'Choose a conversation':'Choose a channel'} className="border-0">
          {direct?'Pick someone on the left, or start a new direct message.':'Pick a channel on the left, or create one for the people you choose.'}
        </EmptyState>
      </div>
    </div>
    <MessageSearch familyId={familyId} accessToken={session.access_token} />
  </>;
}

export function ChannelsScreen({direct=false}:{direct?:boolean}){return <AppShell activePage={direct?'messages':'channels'}><div className="pb-4"><FamilySession>{session=><ScheduleFamily session={session} section={direct?'messages':'channels'}>{family=><ChannelsWorkspace key={family.id} familyId={family.id} session={session} direct={direct} />}</ScheduleFamily>}</FamilySession></div></AppShell>;}
