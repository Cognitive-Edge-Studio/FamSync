"use client";
import { ModuleIcon } from "./ui/module-icon";
import { LiveStatus } from './ui/live-status';
import { Menu } from '@base-ui/react/menu';
import { floatingPanel, menuItem } from './ui/floating';

import type { Session } from '@supabase/auth-js';
import { ArrowDown, ArrowLeft, Archive, AtSign, Bell, BellOff, ChevronDown, Ellipsis, Folder, MessageCircle, PanelRight, Paperclip, Pencil, Reply, RotateCcw, Send, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getBrowserApi } from '@/lib/browser-auth';
import { channelReactions, type ChannelDetail, type ChannelMessage } from '@/lib/channels';
import { useChannelUpdates } from '@/lib/channel-updates';
import { AppShell } from './app-shell';
import { familyError, FamilySession } from './family-session';
import { ChannelFormDialog } from './channel-form-dialog';
import { FormFeedback } from './account-fields';
import { cn } from '@/lib/utils';
import { ConversationList, workspaceFrame } from './channels-screen';
import { Avatar } from './ui/avatar';
import { Badge } from './ui/badge';
import { EmptyState } from './ui/empty-state';
import { Button } from './ui/button';
import {MessageSearch} from './message-search';
import {MessageWorkTools} from './message-work-tools';
import {GuestAccessPanel} from './guest-access-panel';
import {ConversationFilePicker,MessageFiles} from './conversation-files';
import {ChannelAvatar,ChannelImageControls} from './channel-image';
import {foldersPath,type StoredFile} from '@/lib/files';

const byPosition=(a:ChannelMessage,b:ChannelMessage)=>a.position-b.position;
const merge=(old:ChannelMessage[],incoming:ChannelMessage[])=>[...new Map([...old,...incoming].map(m=>[m.id,m])).values()].sort(byPosition);
function Conversation({session,familyId,channelId,guest=false}:{session:Session;familyId:string;channelId:string;guest?:boolean}) {
  const [channel,setChannel]=useState<ChannelDetail>(),[messages,setMessages]=useState<ChannelMessage[]>([]);
  const [nextBefore,setNextBefore]=useState<number|null>(null),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[note,setNote]=useState('');
  const [body,setBody]=useState(''),[reply,setReply]=useState<ChannelMessage|null>(null),[busy,setBusy]=useState(false),[olderBusy,setOlderBusy]=useState(false);
  const [editing,setEditing]=useState(false),[revision,setRevision]=useState(0),[atBottom,setAtBottom]=useState(true);
  const [mentioned,setMentioned]=useState<string[]>([]),[detailsOpen,setDetailsOpen]=useState(false),[toolsFor,setToolsFor]=useState<string|null>(null);
  const detailsButton=useRef<HTMLButtonElement>(null),detailsPanel=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!detailsOpen)return;
    detailsPanel.current?.focus();
    const handleKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setDetailsOpen(false);detailsButton.current?.focus();return;}
      if(event.key!=='Tab'||window.matchMedia('(min-width:1280px)').matches)return;
      const panel=detailsPanel.current;
      const controls=Array.from(panel?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')??[]).filter(element=>element.getClientRects().length>0);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    window.addEventListener('keydown',handleKey);
    return()=>window.removeEventListener('keydown',handleKey);
  },[detailsOpen]);
  const [selectedFiles,setSelectedFiles]=useState<StoredFile[]>([]),[pickingFiles,setPickingFiles]=useState(false);
  const feed=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),draftId=useRef('');
  const latest=useRef(0),earliest=useRef(0),loaded=useRef(false),reading=useRef(false),access=useRef(true),nearBottom=useRef(true);
  const path={familyId,channelId};
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  const connection=useChannelUpdates(session.user.id,access.current?[channelId]:[],refresh);
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      try {
        const api=getBrowserApi(session.access_token);
        const detail=await api.GET('/api/v1/families/{familyId}/channels/{channelId}',{params:{path:{familyId,channelId}},signal:controller.signal});
        if(!detail.data) {
          if([400,403,404].includes(detail.response.status)) {
            if(!controller.signal.aborted){access.current=false;loaded.current=false;latest.current=0;setChannel(undefined);setMessages([]);setReply(null);setLoadError('Channel not found or access has ended.');}
            return;
          }
          throw new Error();
        }
        const initial=!loaded.current;let after=initial?undefined:Math.max(0,earliest.current-1);
        const incoming:ChannelMessage[]=[];let before:number|null=null;
        do {
          const result=await api.GET('/api/v1/families/{familyId}/channels/{channelId}/messages',{
            params:{path:{familyId,channelId},query:{after,limit:50}},signal:controller.signal});
          if(!result.data)throw new Error();
          incoming.push(...result.data.messages);before=result.data.nextBefore;after=result.data.nextAfter??undefined;
          if(result.data.nextAfter===null)break;
        } while(!controller.signal.aborted);
        if(controller.signal.aborted)return;
        access.current=true;setLoadError('');setChannel(detail.data);
        if(initial){setMessages(incoming);setNextBefore(before);loaded.current=true;earliest.current=incoming[0]?.position??0;}
        else setMessages(old=>merge(old,incoming));
        latest.current=Math.max(latest.current,...incoming.map(m=>m.position),0);
      } catch {if(!controller.signal.aborted)setLoadError('We couldn’t refresh the conversation. Try again.');}
    }
    void load();return ()=>controller.abort();
  },[session.access_token,familyId,channelId,revision]);
  const markRead=useCallback(async(position:number)=>{
    if(!position||reading.current||!access.current||document.visibilityState!=='visible')return;
    reading.current=true;
    try {
      const {data}=await getBrowserApi(session.access_token).PUT('/api/v1/families/{familyId}/channels/{channelId}/read',{
        params:{path:{familyId,channelId}},body:{position}});
      if(data)setChannel(old=>old?{...old,readPosition:Math.max(old.readPosition,data.readPosition),unread:data.unread}:old);
    } catch { /* A refresh rechecks access and retries the cursor when the conversation is visible. */ }
    finally {reading.current=false;}
  },[session.access_token,familyId,channelId]);
  useEffect(()=>{
    if(!channel||!nearBottom.current)return;
    const position=messages.at(-1)?.position??0;
    const frame=requestAnimationFrame(()=>{if(feed.current)feed.current.scrollTop=feed.current.scrollHeight;
      if(position>channel.readPosition)void markRead(position);});
    return ()=>cancelAnimationFrame(frame);
  },[messages,channel?.readPosition,markRead,channel]);
  async function older() {
    if(nextBefore===null||olderBusy)return;setOlderBusy(true);setError('');
    const height=feed.current?.scrollHeight??0;
    try {
      const {data}=await getBrowserApi(session.access_token).GET('/api/v1/families/{familyId}/channels/{channelId}/messages',{
        params:{path,query:{before:nextBefore,limit:50}}});
      if(!data)throw new Error();nearBottom.current=false;setAtBottom(false);earliest.current=data.messages[0]?.position??earliest.current;
      setMessages(old=>merge(old,data.messages));setNextBefore(data.nextBefore);
      requestAnimationFrame(()=>{if(feed.current)feed.current.scrollTop+=feed.current.scrollHeight-height;});
    } catch {setError('We couldn’t load earlier messages. Try again.');}finally{setOlderBusy(false);}
  }
  async function send(event:FormEvent) {
    event.preventDefault();if(busy||!body.trim())return;setBusy(true);setError('');setNote('');draftId.current||=crypto.randomUUID();
    try {
      const {data,error,response}=await getBrowserApi(session.access_token).POST('/api/v1/families/{familyId}/channels/{channelId}/messages',{
        params:{path},body:{id:draftId.current,body:body.trim(),replyToId:reply?.id??null,mentionedUserIds:mentioned,fileIds:selectedFiles.map(f=>f.id)}});
      if(data){setMessages(old=>merge(old,[data]));latest.current=Math.max(latest.current,data.position);setBody('');setReply(null);draftId.current='';
        nearBottom.current=true;setAtBottom(true);setMentioned([]);setSelectedFiles([]);setNote('Message sent.');refresh();composer.current?.focus();return;}
      setError(familyError([400,403,404,409].includes(response.status)?error:undefined,'We couldn’t send this message. Your draft is saved here. Try again.'));
    } catch {setError('We couldn’t send this message. Your draft is saved here. Try again.');}finally{setBusy(false);}
  }
  async function react(message:ChannelMessage,emoji:typeof channelReactions[number]) {
    if(busy)return;setBusy(true);setError('');setNote('');
    try {
      const {data,error}=await getBrowserApi(session.access_token).PUT('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/reaction',{
        params:{path:{...path,messageId:message.id}},body:{emoji,active:!message.reactions.find(r=>r.emoji===emoji)?.active}});
      if(!data){setError(familyError(error,'We couldn’t save your reaction. Try again.'));return;}
      setMessages(old=>merge(old,[data]));setNote('Reaction saved.');
    } catch {setError('We couldn’t save your reaction. Try again.');}finally{setBusy(false);}
  }
  async function archive() {
    if(!channel||busy)return;setBusy(true);setError('');setNote('');
    try {
      const {data,error}=await getBrowserApi(session.access_token).PUT('/api/v1/families/{familyId}/channels/{channelId}/archive',{
        params:{path},body:{version:channel.version,archived:!channel.archived}});
      if(data){setChannel(data);setNote(data.archived?'Channel archived.':'Channel restored.');}
      else setError(familyError(error,'We couldn’t change this channel. Refresh and try again.'));
    }catch{setError('We couldn’t change this channel. Refresh and try again.');}finally{setBusy(false);}
  }
  function jump(){nearBottom.current=true;setAtBottom(true);if(feed.current)feed.current.scrollTop=feed.current.scrollHeight;void markRead(messages.at(-1)?.position??0);}
  async function mute(){if(!channel||busy)return;setBusy(true);setError('');try{
    const {data,error}=await getBrowserApi(session.access_token).PUT('/api/v1/families/{familyId}/channels/{channelId}/mute',{params:{path},body:{muted:!channel.muted}});
    if(data){setChannel(data);setNote(data.muted?'Conversation muted. New message and mention alerts are paused.':'Conversation unmuted.');}else setError(familyError(error,'We couldn’t change mute. Try again.'));
  }catch{setError('We couldn’t change mute. Try again.');}finally{setBusy(false);}}
  const back=channel&&!channel.canCreateWork?'/guests/':(channel?.kind==='dm'?'/messages/?':'/channels/?')+new URLSearchParams({family:familyId});
  const backLabel=channel&&!channel.canCreateWork?'All guest channels':channel?.kind==='dm'?'All direct messages':'All channels';
  const guestIds=new Set(channel?.members.filter(m=>m.guest).map(m=>m.userId)??[]);
  const showList=!guest&&!!channel;
  const directPeer=channel?.kind==='dm'?channel.members.find(member=>member.userId!==session.user.id):undefined;
  return <>
    <a href={back} className={cn('mt-4 mb-1 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4',showList&&'lg:hidden')}><ArrowLeft className="size-4" aria-hidden="true" />{backLabel}</a>
    {loadError&&<div className="my-4 grid justify-items-start gap-2"><FormFeedback error={loadError} /><Button variant="outline" onClick={refresh}>Refresh conversation</Button></div>}
    {!channel&&!loadError&&<div className="my-4"><FormFeedback note="Loading conversation…" /></div>}
    {channel&&<div className={cn(workspaceFrame,'grid lg:mt-6',showList?'lg:grid-cols-[18rem_minmax(0,1fr)]':'grid-cols-1',detailsOpen&&(showList?'xl:grid-cols-[18rem_minmax(0,1fr)_18rem]':'xl:grid-cols-[minmax(0,1fr)_18rem]'))}>
      {showList&&<nav aria-label="Conversations" className="hidden min-h-0 border-r border-border lg:flex lg:flex-col"><ConversationList session={session} familyId={familyId} direct={channel.kind==='dm'} activeId={channel.id} pane /></nav>}
      <article className="flex min-h-0 min-w-0 flex-col" aria-labelledby="conversation-title">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {directPeer?<Avatar name={directPeer.name} colorKey={directPeer.userId} className="size-12" />:<ChannelAvatar familyId={familyId} channelId={channel.id} imageFileId={channel.imageFileId} emoji={channel.emoji} accessToken={session.access_token}/>}
            <div className="min-w-0">
              <h1 id="conversation-title" className="truncate text-base font-semibold">{channel.name}</h1>
              <p className="truncate text-xs text-muted-foreground">{channel.topic||(channel.kind==='dm'?'Direct conversation':channel.memberCount+' members')}{channel.muted?' · Muted':''}{channel.archived?' · Archived':''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a href={foldersPath(familyId,channel.id,!channel.canCreateWork)} aria-label="Open conversation files" title="Conversation files" className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted"><ModuleIcon name="folders" className="size-4" /></a>
            <Button variant="ghost" size="icon" disabled={busy} aria-label={channel.muted?'Unmute conversation':'Mute conversation'} title={channel.muted?'Unmute conversation':'Mute conversation'} onClick={()=>void mute()}>{channel.muted?<BellOff aria-hidden="true" />:<ModuleIcon name="notifications" />}</Button>
            {channel.canManage&&<Menu.Root>
              <Menu.Trigger disabled={busy} aria-label="Channel options" title="Channel options" className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"><Ellipsis aria-hidden="true" className="size-4" /></Menu.Trigger>
              <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50"><Menu.Popup className={cn(floatingPanel,'min-w-44')}>
                <Menu.Item className={menuItem} onClick={()=>setEditing(true)}><Pencil aria-hidden="true" />Edit channel</Menu.Item>
                <Menu.Item className={menuItem} onClick={()=>void archive()}>{channel.archived?<RotateCcw aria-hidden="true" />:<Archive aria-hidden="true" />}{channel.archived?'Restore channel':'Archive channel'}</Menu.Item>
              </Menu.Popup></Menu.Positioner></Menu.Portal>
            </Menu.Root>}
            <Button ref={detailsButton} variant={detailsOpen?'secondary':'ghost'} size="icon" aria-label="Conversation details" aria-expanded={detailsOpen} aria-controls="conversation-details" title="Details"
              onClick={()=>setDetailsOpen(v=>!v)}><PanelRight aria-hidden="true" /></Button>
          </div>
        </header>
        {(error||note)&&<div className="border-b border-border px-4 py-2"><FormFeedback error={error} note={note} /></div>}
        {channel.archived&&<p className="border-b border-border bg-muted px-4 py-2 text-sm text-muted-foreground">Archived channel. History is available; restore it to post or react.</p>}
        <div ref={feed} className="relative max-h-[60dvh] min-h-48 overflow-y-auto px-3 py-4 sm:px-5 lg:max-h-none lg:flex-1" tabIndex={0} aria-label="Conversation history"
          onScroll={()=>{const el=feed.current;if(!el)return;const bottom=el.scrollHeight-el.scrollTop-el.clientHeight<50;nearBottom.current=bottom;setAtBottom(bottom);if(bottom)void markRead(messages.at(-1)?.position??0);}}>
          {nextBefore!==null&&<div className="mb-4 text-center"><Button variant="outline" disabled={olderBusy} onClick={()=>void older()}>{olderBusy?'Loading history…':'Load earlier messages'}</Button></div>}
          {messages.length===0&&<EmptyState icon="messages" tone="lavender" title="No messages yet" className="border-0">Start the conversation. Send the first message.</EmptyState>}
          <ol className="grid gap-4" aria-label="Conversation messages">{messages.map(message=>{
            const mine=message.author?.userId===session.user.id,author=message.author?.name??'Former member',isGuest=!!message.author&&guestIds.has(message.author.userId);
            return <motion.li layout="position" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} key={message.id} id={'message-'+message.id} data-message-id={message.id}
              className={cn('group/message flex min-w-0 gap-2.5',mine&&'flex-row-reverse')}>
              {!mine&&<Avatar name={author} colorKey={message.author?.userId} className="mt-5" />}
              <div className={cn('grid min-w-0 max-w-[min(36rem,85%)] gap-1',mine?'justify-items-end':'justify-items-start')}>
                <div className={cn('flex flex-wrap items-baseline gap-x-2 text-xs',mine&&'flex-row-reverse')}><span className="font-medium wrap-anywhere">{mine?'You':author}{isGuest?' · Guest':''}</span>
                  <time dateTime={message.createdAt} className="text-muted-foreground">{new Date(message.createdAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>
                <div className={cn('min-w-0 rounded-2xl px-3.5 py-2.5',mine?'rounded-tr-md bg-primary text-primary-foreground':'rounded-tl-md bg-muted')}>
                  {message.replyTo&&<blockquote className={cn('mb-2 border-l-2 pl-2.5 text-xs',mine?'border-primary-foreground/40 text-primary-foreground':'border-border text-muted-foreground')}><span className="font-semibold">Reply to {message.replyTo.author?.name??'Former member'}</span>
                    <p className="mt-0.5 wrap-anywhere whitespace-pre-wrap">{message.replyTo.body}</p></blockquote>}
                  <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">{message.body}</p>
                  {!!message.mentions.length&&<p className={cn('mt-1.5 text-xs wrap-anywhere',mine?'text-primary-foreground':'text-lavender-foreground')}>Mentions: {message.mentions.map(m=>'@'+m.name).join(', ')}</p>}
                </div>
                <div className={cn('flex flex-wrap items-center gap-0.5',mine&&'justify-end')} role="group" aria-label={'Actions for message '+message.position}>
                  {channelReactions.map(emoji=>{const reaction=message.reactions.find(r=>r.emoji===emoji);return <Button key={emoji} variant="ghost"
                    className={cn('h-7 gap-1 rounded-full px-1.5 text-sm aria-pressed:bg-lavender aria-pressed:text-lavender-foreground',!reaction?.count&&'opacity-0 group-hover/message:opacity-60 group-focus-within/message:opacity-60 hover:!opacity-100 focus-visible:!opacity-100 [@media(hover:none)]:opacity-50')} aria-label={'React '+emoji+' to message '+message.position}
                    aria-pressed={reaction?.active??false} disabled={busy||channel.archived} onClick={()=>void react(message,emoji)}>{emoji}{!!reaction?.count&&<span className="text-xs tabular-nums">{reaction.count}</span>}</Button>;})}
                  {!message.replyTo&&<Button variant="ghost" className="h-7 gap-1 px-2 text-xs" aria-label={'Reply to message '+message.position} disabled={busy||channel.archived}
                    onClick={()=>{setReply(message);draftId.current='';composer.current?.focus();}}><Reply aria-hidden="true" className="size-3.5" />Reply</Button>}
                  {(channel.canCreateWork||message.files.length<5)&&!channel.archived&&<Button variant="ghost" size="icon" className="size-7" aria-expanded={toolsFor===message.id} aria-label={'More actions for message '+message.position} title="More actions"
                    onClick={()=>setToolsFor(v=>v===message.id?null:message.id)}><Ellipsis aria-hidden="true" /></Button>}
                </div>
                <div className={cn('grid w-full min-w-0 gap-1',mine&&'justify-items-end')}><MessageWorkTools actions={toolsFor===message.id} session={session} familyId={familyId} channel={channel} message={message} onChanged={refresh} />
                  <MessageFiles showAttach={toolsFor===message.id} session={session} familyId={familyId} channel={channel} message={message} onChanged={refresh}/></div>
              </div>
            </motion.li>;})}</ol>
        </div>
        {!atBottom&&<div className="flex justify-center border-t border-border py-2"><Button variant="outline" className="gap-1.5" onClick={jump}><ArrowDown aria-hidden="true" />Jump to latest messages</Button></div>}
        {!channel.archived&&<form className="grid gap-2 border-t border-border p-3 sm:p-4" onSubmit={event=>void send(event)}>
          {!!selectedFiles.length&&<ul aria-label="Files to send" className="flex flex-wrap gap-2">{selectedFiles.map(f=><li key={f.id} className="flex min-w-0 items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-xs"><Paperclip aria-hidden="true" className="size-3 shrink-0" /><span className="max-w-48 truncate">{f.fileName}</span><Button aria-label={'Remove '+f.fileName} variant="ghost" className="h-6 px-2 text-xs" disabled={busy} onClick={()=>{setSelectedFiles(fs=>fs.filter(v=>v.id!==f.id));draftId.current='';}}>Remove</Button></li>)}</ul>}
          {reply&&<div className="flex min-w-0 items-start justify-between gap-2 rounded-xl border-l-2 border-lavender-foreground bg-muted p-2.5"><div className="min-w-0 text-xs"><p className="font-semibold">Replying to {reply.author?.name??'Former member'}</p><p className="mt-0.5 truncate">{reply.body.slice(0,180)}</p></div>
            <Button variant="ghost" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={()=>{setReply(null);draftId.current='';}}>Cancel reply</Button></div>}
          <label htmlFor="channel-message" className="sr-only">{reply?'Your reply':'Message'}</label>
          <div className="flex items-end gap-2 rounded-xl border border-border bg-panel p-1.5 focus-within:ring-3 focus-within:ring-ring/30">
            <textarea ref={composer} id="channel-message" className="max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-base outline-none sm:text-sm" rows={2} maxLength={4000} required disabled={busy}
              placeholder={reply?'Write a reply…':'Write a message…'} value={body} onChange={event=>{setBody(event.target.value);draftId.current='';}}
              onKeyDown={event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();event.currentTarget.form?.requestSubmit();}}} />
            <Button type="submit" size="icon" className="shrink-0" aria-label={busy?'Sending…':'Send message'} title="Send message (Ctrl+Enter)" disabled={busy||!body.trim()}><Send aria-hidden="true" /></Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" className="h-8 gap-1.5 px-2 text-xs" disabled={busy||selectedFiles.length>=5} onClick={()=>setPickingFiles(true)}><Paperclip aria-hidden="true" />Attach files</Button>
              <details className="relative text-xs"><summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 font-medium hover:bg-accent"><AtSign aria-hidden="true" className="size-4" />Mention members{mentioned.length?' ('+mentioned.length+')':''}</summary>
                <div className="absolute bottom-full left-0 z-10 mb-2 grid w-64 gap-2 rounded-xl border border-border bg-panel p-3 shadow-lg">
                  {channel.members.filter(m=>m.userId!==session.user.id).map(m=><label key={m.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={'Mention '+m.name+(m.guest?' (guest)':'')} disabled={busy} checked={mentioned.includes(m.userId)}
                    onChange={event=>{setMentioned(ids=>event.target.checked?[...ids,m.userId]:ids.filter(id=>id!==m.userId));draftId.current='';}} />{m.name}{m.guest?' · Guest':''}</label>)}
                  {!!mentioned.length&&<Button variant="ghost" className="justify-self-start" disabled={busy} onClick={()=>{setMentioned([]);draftId.current='';}}>Clear mentions</Button>}
                </div></details>
            </div>
            <p className="text-xs text-muted-foreground">{body.length}/4000 · Plain text</p>
          </div>
        </form>}
      </article>
      <aside id="conversation-details" ref={detailsPanel} tabIndex={-1} aria-label="Conversation details"
        className={cn('min-h-0 overflow-y-auto border-border bg-panel outline-none xl:border-l',
          detailsOpen?'fixed inset-y-0 right-0 z-40 block w-[min(22rem,92vw)] border-l shadow-xl xl:static xl:z-auto xl:w-auto xl:shadow-none':'hidden')}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3"><h2 className="text-base font-semibold">Details</h2>
          <Button variant="ghost" size="icon" aria-label="Close details" onClick={()=>{setDetailsOpen(false);detailsButton.current?.focus();}}><X aria-hidden="true" /></Button></div>
        <div className="grid gap-4 p-4">
          {channel.description&&<p className="text-sm wrap-anywhere whitespace-pre-wrap text-muted-foreground">{channel.description}</p>}
          <a className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-muted" href={foldersPath(familyId,channel.id,!channel.canCreateWork)}><ModuleIcon name="folders" className="size-4" />Files and folders</a>
          <MessageSearch compact familyId={familyId} accessToken={session.access_token} conversationId={channel.id} />
          <details className="group border-t border-border pt-1" open>
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>Members <span className="ml-1 text-muted-foreground">{channel.memberCount}</span></span><ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
            <ul className="grid gap-3 py-2">{channel.members.map(member=><li className="flex min-w-0 items-center gap-2.5 text-sm" key={member.userId}><Avatar name={member.name} colorKey={member.userId} size="sm" />
              <span className="min-w-0 truncate">{member.name}</span>{member.guest&&<Badge tone="peach">Guest</Badge>}{member.userId===channel.manager?.userId&&<Badge tone="outline">Manager</Badge>}</li>)}</ul>
          </details>
          {!channel.canCreateWork&&<p className="rounded-xl bg-peach p-3 text-sm text-peach-foreground">You have guest access to this channel. Family work and the family directory are restricted.</p>}
          {channel.canManage&&<details className="group border-t border-border pt-1"><summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">Channel settings<ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
            <div className="grid gap-3 pt-2">
              <ChannelImageControls compact session={session} familyId={familyId} channel={channel} onChanged={refresh}/>
              <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-medium">Guest access</summary><div className="mt-3"><GuestAccessPanel familyId={familyId} accessToken={session.access_token} channelId={channel.id}/></div></details>
            </div>
          </details>}
          <LiveStatus state={connection} />
        </div>
      </aside>
    </div>}
    {detailsOpen&&<div aria-hidden="true" className="fixed inset-0 z-30 bg-black/35 xl:hidden" onClick={()=>{setDetailsOpen(false);detailsButton.current?.focus();}} />}
    {pickingFiles&&channel&&<ConversationFilePicker session={session} familyId={familyId} channel={channel} onClose={()=>setPickingFiles(false)} onPick={async file=>{setSelectedFiles(fs=>fs.some(f=>f.id===file.id)?fs:[...fs,file]);if(!body.trim())setBody('Shared '+file.fileName);draftId.current='';}}/>}
    {editing&&channel&&<ChannelFormDialog existing={channel} familyId={familyId} accessToken={session.access_token} userId={session.user.id} onClose={()=>setEditing(false)}
      onSaved={data=>{setChannel(data);setEditing(false);setNote('Channel updated.');setError('');refresh();}} />}
  </>;
}
function ChannelRoute({session,guest}:{session:Session;guest:boolean}) {
  const [params,setParams]=useState<{family:string;id:string}|null>();
  useEffect(()=>{const query=new URLSearchParams(window.location.search),family=query.get('family'),id=query.get('id');setParams(family&&id?{family,id}:null);},[]);
  if(params===undefined)return <FormFeedback note="Loading conversation…" />;
  if(!params)return <FormFeedback error="Channel not found." />;
  return <Conversation key={params.family+params.id} familyId={params.family} channelId={params.id} session={session} guest={guest} />;
}
export function ChannelScreen({direct=false,guest=false}:{direct?:boolean;guest?:boolean}){return <AppShell guestMode={guest} activePage={guest?'guests':direct?'messages':'channels'}><div className="pb-4"><FamilySession>{session=><ChannelRoute key={session.user.id} session={session} guest={guest} />}</FamilySession></div></AppShell>;}
