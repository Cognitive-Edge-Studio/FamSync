"use client";
import { takeCreateRequest } from "@/lib/quick-create";
import type { Session } from '@supabase/auth-js';
import { useEffect, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { BellOff, Ellipsis, Pin, Plus, Search } from 'lucide-react';
import { StarredMessages } from './chat-dialogs';
import { getBrowserApi } from '@/lib/browser-auth';
import { attachmentLabel, channelPath, type Channel } from '@/lib/channels';
import { useChannelUpdates } from '@/lib/channel-updates';
import { cn } from '@/lib/utils';
import { AppShell } from './app-shell';
import { FamilySession } from './family-session';
import { ScheduleFamily } from './schedule-family';
import { FormFeedback, inputClass } from './account-fields';
import { Avatar } from './ui/avatar';
import { floatingPanel, menuItem } from './ui/floating';
import { dayLabel } from './chat-feed';
import { ChannelFormDialog } from './channel-form-dialog';
import { Button } from './ui/button';
import {OpenDirectDialog} from './open-direct-dialog';
import {MessageSearch} from './message-search';
import {ChannelAvatar} from './channel-image';
import { EmptyState } from './ui/empty-state';
import { LiveStatus } from './ui/live-status';

type Filter='all'|'channel'|'dm';
const filters:{value:Filter;label:string}[]=[{value:'all',label:'All'},{value:'channel',label:'Channels'},{value:'dm',label:'Direct'}];
function when(value:string){
  const label=dayLabel(value);
  if(label==='Today')return new Date(value).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return label==='Yesterday'?label:new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function preview(channel:Channel,userId:string){
  const last=channel.lastMessage;
  if(!last)return channel.topic||(channel.kind==='dm'?'No messages yet':channel.memberCount+' members');
  const author=last.author?.userId===userId?'You: ':channel.kind==='dm'?'':(last.author?.name??'Former member')+': ';
  return author+(last.deleted?'Message deleted':last.body.replace(/\s+/g,' ')||(last.fileCount?attachmentLabel(last.attachment,last.fileCount):'Attachment removed'));
}

// The conversation list, newest activity first. As a page it is the whole screen on phones; as a pane it sits beside an open conversation.
export function ConversationList({session,familyId,start='all',activeId,pane=false}:{session:Session;familyId:string;start?:Filter;activeId?:string;pane?:boolean}) {
  const [filter,setFilter]=useState<Filter>(start);
  const [channels,setChannels]=useState<Channel[]>([]),[query,setQuery]=useState(''),[search,setSearch]=useState('');
  const [archived,setArchived]=useState(false),[pages,setPages]=useState(1),[next,setNext]=useState<string|null>(null);
  const [revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[creating,setCreating]=useState<'channel'|'dm'|null>(()=>pane?null:takeCreateRequest('dm')?'dm':takeCreateRequest('channel')?'channel':null);
  const connection=useChannelUpdates(session.user.id,channels.map(c=>c.id),()=>setRevision(v=>v+1));
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    async function load(){
      try {
        const loaded:Channel[]=[];let cursor:string|undefined,nextCursor:string|null=null;
        for(let page=0;page<pages;page++){
          const {data,response}=await getBrowserApi(session.access_token).GET('/api/v1/families/{familyId}/channels',{
            params:{path:{familyId},query:{kind:filter,q:search||undefined,archived:String(archived) as 'true'|'false',cursor}},signal:controller.signal,
          });
          if(controller.signal.aborted)return;if([403,404].includes(response.status))setChannels([]);if(!data)throw new Error();
          loaded.push(...data.channels);nextCursor=data.nextCursor;if(!nextCursor)break;cursor=nextCursor;
        }
        if(!controller.signal.aborted){
          setChannels([...new Map(loaded.map(c=>[c.id,c])).values()]);setNext(nextCursor);
          const items=loaded.filter(c=>c.lastPosition>c.deliveredPosition).slice(0,100).map(c=>({id:c.id,position:c.lastPosition}));
          if(items.length)void getBrowserApi(session.access_token).PUT('/api/v1/families/{familyId}/channels/delivered',{params:{path:{familyId}},body:{items}}).catch(()=>{});
        }
      }catch{if(!controller.signal.aborted){setError('We couldn’t load your conversations. Try again.');}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();
    return ()=>controller.abort();
  },[session.access_token,familyId,filter,search,archived,pages,revision]);
  useEffect(()=>{const changed=()=>setRevision(v=>v+1);window.addEventListener("famsync:chats",changed);return()=>window.removeEventListener("famsync:chats",changed);},[]);
  async function prefer(channel:Channel,body:{pinned?:boolean;hidden?:boolean;unread?:boolean}){
    setError('');
    try{const {data}=await getBrowserApi(session.access_token).PUT('/api/v1/families/{familyId}/channels/{channelId}/preferences',{params:{path:{familyId,channelId:channel.id}},body});if(!data)throw new Error();}
    catch{setError('We couldn’t change this chat. Try again.');}
    setRevision(v=>v+1);
  }
  // Search as you type, after a short pause.
  useEffect(()=>{const next=query.trim();if(next===search)return;const timer=setTimeout(()=>{setPages(1);setChannels([]);setSearch(next);},250);return ()=>clearTimeout(timer);},[query,search]);
  const searchId=pane?'pane-channels-search':'channels-search';
  return <div className="flex min-h-0 flex-col">
    <div className="grid gap-3 border-b border-border p-4">
      <div className="flex items-center justify-between gap-2">
        {pane?<h2 className="text-base font-semibold">Chats</h2>:<h1 className="text-xl font-semibold">Chats</h1>}
        <Menu.Root><Menu.Trigger render={<Button size="icon" aria-label="New chat" title="New chat" />}><Plus aria-hidden="true" /></Menu.Trigger>
          <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50"><Menu.Popup className={cn(floatingPanel,'min-w-44')}>
            <Menu.Item className={menuItem} onClick={()=>setCreating('dm')}>New direct message</Menu.Item>
            <Menu.Item className={menuItem} onClick={()=>setCreating('channel')}>New channel</Menu.Item>
          </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
      </div>
      <form className="flex items-center gap-2" onSubmit={e=>e.preventDefault()} role="search">
        <label htmlFor={searchId} className="sr-only">Find a chat</label>
        <div className="relative min-w-0 grow"><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input id={searchId} className={inputClass+' pl-9'} placeholder="Find a chat" maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} /></div>
      </form>
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show">
        {filters.map(({value,label})=><Button key={value} variant={filter===value&&!archived?'secondary':'ghost'} className="h-8 rounded-full px-3 text-xs" aria-pressed={filter===value&&!archived} onClick={()=>{if(filter===value&&!archived)return;setFilter(value);setArchived(false);setPages(1);setChannels([]);}}>{label}</Button>)}
        <Button variant={archived?'secondary':'ghost'} className="h-8 rounded-full px-3 text-xs" aria-pressed={archived} onClick={()=>{setArchived(v=>!v);setFilter('all');setPages(1);setChannels([]);}}>Archived</Button>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <FormFeedback error={error} note={loading&&!channels.length?'Loading conversations…':undefined} />
      {error&&<Button variant="outline" className="m-2" onClick={()=>setRevision(v=>v+1)}>Try again</Button>}
      {!loading&&!error&&channels.length===0&&<p className="m-2 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{search?'No conversations match your search.':archived?'No archived chats.':filter==='dm'?'No direct messages yet. Choose a family member to start.':filter==='channel'?'No channels yet. Create one and choose its members.':'No chats yet. Start a direct message or create a channel.'}</p>}
      <ul className="grid grid-cols-1 gap-0.5" aria-label="Your chats">{channels.map(channel=><li key={channel.id} className="group/chat relative flex min-w-0 items-center">
        <a aria-current={channel.id===activeId?'page':undefined} className="flex min-w-0 grow items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent aria-[current=page]:bg-muted" href={channelPath(familyId,channel.id,channel.kind)}>
          {channel.kind==='dm'?<Avatar name={channel.name} colorKey={channel.peer?.userId} className="size-12" />:<ChannelAvatar familyId={familyId} channelId={channel.id} imageFileId={channel.imageFileId} emoji={channel.emoji} accessToken={session.access_token}/>}
          <div className="min-w-0 grow">
            <div className="flex items-baseline justify-between gap-2">
              {pane?<h3 className={cn('truncate text-sm',channel.unread>0?'font-semibold':'font-medium')}>{channel.name}</h3>:<h2 className={cn('truncate text-sm',channel.unread>0?'font-semibold':'font-medium')}>{channel.name}</h2>}
              {channel.lastMessage&&<time dateTime={channel.lastMessage.createdAt} className="shrink-0 text-xs text-muted-foreground">{when(channel.lastMessage.createdAt)}</time>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className={cn('truncate text-xs',channel.unread>0||channel.markedUnread?'text-foreground':'text-muted-foreground')}>{(channel.archived?'Archived for everyone · ':'')+preview(channel,session.user.id)}</p>
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{channel.pinned&&<Pin aria-label="Pinned" role="img" className="size-3.5" />}{channel.muted&&<BellOff aria-label="Muted" role="img" className="size-3.5" />}
                {channel.unread>0&&<span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 leading-5 font-semibold text-primary-foreground" role="img" aria-label={channel.unread+' unread messages'}>{channel.unread}</span>}
                {channel.unread===0&&channel.markedUnread&&<span className="size-2.5 rounded-full bg-primary" role="img" aria-label="Marked unread" />}</span>
            </div>
          </div>
        </a>
          <Menu.Root><Menu.Trigger aria-label={'Options for '+channel.name} title="Chat options" className="absolute top-1 right-1 inline-flex size-7 items-center justify-center rounded-lg border border-border bg-panel opacity-0 shadow-sm group-hover/chat:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:shrink-0 [@media(hover:none)]:border-transparent [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-none"><Ellipsis aria-hidden="true" className="size-4" /></Menu.Trigger>
            <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50"><Menu.Popup className={cn(floatingPanel,'min-w-44')}>
              {!channel.hidden&&<Menu.Item className={menuItem} onClick={()=>void prefer(channel,{pinned:!channel.pinned})}>{channel.pinned?'Unpin chat':'Pin chat'}</Menu.Item>}
              {channel.unread===0&&<Menu.Item className={menuItem} onClick={()=>void prefer(channel,{unread:!channel.markedUnread})}>{channel.markedUnread?'Mark as read':'Mark as unread'}</Menu.Item>}
              <Menu.Item className={menuItem} onClick={()=>void prefer(channel,{hidden:!channel.hidden})}>{channel.hidden?'Move back to chats':'Archive for me'}</Menu.Item>
            </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></li>)}</ul>
      {next&&<Button className="m-2" variant="outline" disabled={loading} onClick={()=>setPages(v=>v+1)}>Load more chats</Button>}
      <LiveStatus state={connection} className="px-2.5 pt-3" />
    </div>
    {creating==='dm'&&<OpenDirectDialog familyId={familyId} accessToken={session.access_token} userId={session.user.id} onClose={()=>setCreating(null)} />}
    {creating==='channel'&&<ChannelFormDialog familyId={familyId} accessToken={session.access_token} userId={session.user.id} onClose={()=>setCreating(null)} />}
  </div>;
}

// Shared frame for the chat workspace: one bordered panel that fills the screen height on larger screens.
export const workspaceFrame='mt-4 overflow-hidden rounded-2xl border border-border bg-panel sm:mt-6 lg:h-[calc(100svh-10.5rem)] lg:min-h-[32rem]';

function ChannelsWorkspace({session,familyId,direct}:{session:Session;familyId:string;direct:boolean}){
  return <>
    <div className={cn(workspaceFrame,'grid lg:grid-cols-[20rem_minmax(0,1fr)]')}>
      <div className="min-h-0 lg:border-r lg:border-border"><ConversationList session={session} familyId={familyId} start={direct?'all':'channel'} /></div>
      <div className="hidden place-items-center p-8 lg:grid">
        <EmptyState icon="messages" tone="lavender" title="Choose a chat" className="border-0">
          Pick a conversation on the left, or start a new one.
        </EmptyState>
      </div>
    </div>
    <MessageSearch familyId={familyId} accessToken={session.access_token} />
    <StarredMessages familyId={familyId} accessToken={session.access_token} />
  </>;
}

export function ChannelsScreen({direct=false}:{direct?:boolean}){return <AppShell activePage="messages"><div className="pb-4"><FamilySession>{session=><ScheduleFamily session={session} section={direct?'messages':'channels'}>{family=><ChannelsWorkspace key={family.id} familyId={family.id} session={session} direct={direct} />}</ScheduleFamily>}</FamilySession></div></AppShell>;}
