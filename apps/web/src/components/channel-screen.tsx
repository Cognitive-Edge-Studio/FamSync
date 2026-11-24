"use client";
import { ModuleIcon } from "./ui/module-icon";
import { LiveStatus } from './ui/live-status';
import { Menu } from '@base-ui/react/menu';
import { floatingPanel, menuItem } from './ui/floating';

import type { Session } from '@supabase/auth-js';
import { ArrowDown, ArrowLeft, Archive, BellOff, ChevronDown, Ellipsis, LogOut, PanelRight, Paperclip, Pencil, Pin, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readDraft, removeDraft, saveDraft, type DraftFile, type DraftReply, type Outgoing } from '@/lib/chat-drafts';
import { VoiceRecorder, type Recording } from './voice-recorder';
import { attachmentLabel } from '@/lib/channels';
import { ChatComposer, type Draft, type Seed } from './chat-composer';
import { ChatFeed, dayLabel, receiptPeople, replyText, unreadDividerId, type FeedActions } from './chat-feed';
import { ConfirmDialog, ForwardDialog, MessageInfoDialog } from './chat-dialogs';
import { fileProblem, uploadChatFile } from '@/lib/chat-upload';
import { getBrowserApi } from '@/lib/browser-auth';
import { type ChannelDetail, type ChannelMessage } from '@/lib/channels';
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
import {GuestAccessPanel} from './guest-access-panel';
import {ConversationFilePicker} from './conversation-files';
import {ChannelAvatar,ChannelImageControls} from './channel-image';
import {foldersPath} from '@/lib/files';

const byPosition=(a:ChannelMessage,b:ChannelMessage)=>a.position-b.position;
// A slower response never replaces a newer state of the same message.
const merge=(old:ChannelMessage[],incoming:ChannelMessage[])=>{
  const all=new Map(old.map(m=>[m.id,m]));
  for(const m of incoming)if((all.get(m.id)?.changeSeq??-1)<=m.changeSeq)all.set(m.id,m);
  return [...all.values()].sort(byPosition);
};
const uncertain='Connection problem. It may not have been sent; retrying is safe.';
function seenLabel(value:string){
  const day=dayLabel(value),time=new Date(value).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return 'Last seen '+(day==='Today'?'today at '+time:day==='Yesterday'?'yesterday at '+time:'on '+new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'}));
}
type Upload={id:string;file:File;progress:number;error?:string};
const restore=(items:Outgoing[]):Outgoing[]=>items.map(item=>item.state==='sending'?{...item,state:'failed',error:uncertain}:item);
function Conversation({session,familyId,channelId,guest=false}:{session:Session;familyId:string;channelId:string;guest?:boolean}) {
  const [channel,setChannel]=useState<ChannelDetail>(),[messages,setMessages]=useState<ChannelMessage[]>([]);
  const [nextBefore,setNextBefore]=useState<number|null>(null),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[note,setNote]=useState('');
  const [saved]=useState(()=>readDraft(session.user.id,channelId));
  const [seed,setSeed]=useState<Seed>({body:saved.body,mentions:saved.mentions,key:0}),[reply,setReply]=useState<DraftReply|null>(saved.reply),[busy,setBusy]=useState(false),[olderBusy,setOlderBusy]=useState(false);
  const [editing,setEditing]=useState(false),[revision,setRevision]=useState(0),[atBottom,setAtBottom]=useState(true);
  const [outgoing,setOutgoing]=useState<Outgoing[]>(()=>restore(saved.outgoing)),[unreadAfter,setUnreadAfter]=useState<number|null>(null),[highlighted,setHighlighted]=useState<string|null>(null);
  const [detailsOpen,setDetailsOpen]=useState(false),[toolsFor,setToolsFor]=useState<string|null>(null);
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
  const feed=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),draft=useRef<Draft>({body:saved.body,mentions:saved.mentions});
  const [selectedFiles,setSelectedFiles]=useState<DraftFile[]>(saved.files),[pickingFiles,setPickingFiles]=useState(false);
  const [uploads,setUploads]=useState<Upload[]>([]),[dragging,setDragging]=useState(false),[editTarget,setEditTarget]=useState<ChannelMessage|null>(null);
  const [forwarding,setForwarding]=useState<ChannelMessage|null>(null),[deleting,setDeleting]=useState<ChannelMessage|null>(null),[leaving,setLeaving]=useState(false),[infoFor,setInfoFor]=useState<ChannelMessage|null>(null),[recording,setRecording]=useState(false);
  const [typing,setTyping]=useState<Record<string,number>>({}),typedAt=useRef(0);
  const uploadQueue=useRef<Upload[]>([]),uploadBusy=useRef<{id:string;stop:AbortController}|null>(null),uploaded=useRef(new Map<string,number>()),filesRef=useRef<DraftFile[]>(selectedFiles);filesRef.current=selectedFiles;
  // Only scrolling up leaves the bottom; content that grows while loading does not.
  const lastTop=useRef(0),beforeEdit=useRef<Draft|null>(null);
  const queue=useRef<Outgoing[]>(outgoing),flushing=useRef(false),token=useRef(session.access_token);token.current=session.access_token;
  const before=useRef<number|null>(null),loadingOlder=useRef(false),cursor=useRef(0),mounted=useRef(true),placed=useRef(false),askedFor=useRef<string|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;uploadBusy.current?.stop.abort();};},[]);
  const latest=useRef(0),earliest=useRef(0),loaded=useRef(false),reading=useRef(false),access=useRef(true),nearBottom=useRef(true);
  const path={familyId,channelId};
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  const connection=useChannelUpdates(session.user.id,access.current?[channelId]:[],refresh,(id,userId,active)=>{
    if(id===channelId&&userId!==session.user.id)setTyping(old=>{const next={...old};if(active)next[userId]=Date.now();else delete next[userId];return next;});
  });
  // A typing signal that is not renewed fades after a few seconds.
  const someoneTyping=Object.keys(typing).length>0;
  useEffect(()=>{
    if(!someoneTyping)return;
    const timer=setInterval(()=>setTyping(old=>{const next=Object.fromEntries(Object.entries(old).filter(([,at])=>Date.now()-at<6000));return Object.keys(next).length===Object.keys(old).length?old:next;}),1000);
    return()=>clearInterval(timer);
  },[someoneTyping]);
  function signalTyping(active:boolean){
    if(active?Date.now()-typedAt.current<3000:!typedAt.current)return;
    typedAt.current=active?Date.now():0;
    void getBrowserApi(token.current).POST('/api/v1/families/{familyId}/channels/{channelId}/typing',{params:{path:{familyId,channelId}},body:{active}}).catch(()=>{});
  }
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      try {
        const api=getBrowserApi(session.access_token);
        const detail=await api.GET('/api/v1/families/{familyId}/channels/{channelId}',{params:{path:{familyId,channelId}},signal:controller.signal});
        if(!detail.data) {
          if([400,403,404].includes(detail.response.status)) {
            if(!controller.signal.aborted){access.current=false;loaded.current=false;latest.current=0;removeDraft(session.user.id,channelId);queue.current=[];setOutgoing([]);uploadQueue.current=[];uploadBusy.current?.stop.abort();setUploads([]);setEditTarget(null);setForwarding(null);setDeleting(null);setRecording(false);setSelectedFiles([]);setSeed(old=>({body:'',mentions:[],key:old.key+1}));setChannel(undefined);setMessages([]);setReply(null);setLoadError('Channel not found or access has ended.');}
            return;
          }
          throw new Error();
        }
        const initial=!loaded.current;let since=initial?undefined:cursor.current;
        const from=initial?undefined:earliest.current,incoming:ChannelMessage[]=[];let next:number|null=null,latestChange=0;
        do {
          const result=await api.GET('/api/v1/families/{familyId}/channels/{channelId}/messages',{
            params:{path:{familyId,channelId},query:{changedSince:since,from,limit:initial?50:100}},signal:controller.signal});
          if(!result.data)throw new Error();
          incoming.push(...result.data.messages);if(initial)next=result.data.nextBefore;latestChange=result.data.latestChange;
          if(result.data.nextChange===null)break;since=result.data.nextChange;
        } while(!controller.signal.aborted);
        if(controller.signal.aborted)return;
        access.current=true;setLoadError('');setChannel(detail.data);cursor.current=Math.max(cursor.current,latestChange);
        if(initial){
          setMessages(incoming);before.current=next;setNextBefore(next);loaded.current=true;earliest.current=incoming[0]?.position??0;
          if(detail.data.unread>0)setUnreadAfter(detail.data.readPosition);
        } else if(incoming.length)setMessages(old=>merge(old,incoming));
        latest.current=Math.max(latest.current,...incoming.map(m=>m.position),0);
        // This device has the messages now; reading them is acknowledged separately.
        if(detail.data.deliveredPosition<latest.current)void api.PUT('/api/v1/families/{familyId}/channels/delivered',{params:{path:{familyId}},body:{items:[{id:channelId,position:latest.current}]}}).catch(()=>{});
        // Someone whose message has arrived is no longer typing it.
        if(!initial&&incoming.length){const last=incoming.reduce((a,b)=>a.position>b.position?a:b);setTyping(old=>{if(!last.author||!(last.author.userId in old))return old;const next={...old};delete next[last.author.userId];return next;});}
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
  // Opening a conversation shows its first unread message, or a requested one; afterwards the view follows new messages.
  useEffect(()=>{
    if(!channel||!loaded.current)return;
    const frame=requestAnimationFrame(()=>{
      const el=feed.current;if(!el)return;
      if(!placed.current){
        placed.current=true;
        const wanted=new URLSearchParams(window.location.search).get('message');
        if(wanted){nearBottom.current=false;setAtBottom(false);void jumpTo(wanted);return;}
        const divider=document.getElementById(unreadDividerId);
        if(divider){
          el.scrollTop+=divider.getBoundingClientRect().top-el.getBoundingClientRect().top-12;
          nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<50;setAtBottom(nearBottom.current);
        }
      }
      if(!nearBottom.current)return;
      el.scrollTop=el.scrollHeight;
      const position=messages.at(-1)?.position??0;
      if(position>channel.readPosition)void markRead(position);
    });
    return ()=>cancelAnimationFrame(frame);
  // jumpTo reads refs only; it must not restart placement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[messages,outgoing.length,channel,markRead]);
  // Photos and wide content can finish loading after placement; stay at the bottom when the reader is there.
  useEffect(()=>{
    const el=feed.current;if(!el||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(()=>{if(nearBottom.current)el.scrollTop=el.scrollHeight;});
    for(const child of Array.from(el.children))observer.observe(child);
    return()=>observer.disconnect();
  },[!!channel,messages.length===0]);
  async function loadOlder(limit=50) {
    const start=before.current;if(start===null||loadingOlder.current)return false;
    loadingOlder.current=true;setOlderBusy(true);
    const since=cursor.current,height=feed.current?.scrollHeight??0;
    try {
      const {data}=await getBrowserApi(token.current).GET('/api/v1/families/{familyId}/channels/{channelId}/messages',{
        params:{path:{familyId,channelId},query:{before:start,limit}}});
      if(!data)throw new Error();
      if(!mounted.current||!access.current)return false;
      nearBottom.current=false;setAtBottom(false);earliest.current=data.messages[0]?.position??earliest.current;
      before.current=data.nextBefore;setNextBefore(data.nextBefore);setMessages(old=>merge(old,data.messages));
      // Changes made to this page while it loaded were outside the last check, so check from where it began.
      cursor.current=Math.min(cursor.current,since);
      requestAnimationFrame(()=>{if(feed.current)feed.current.scrollTop+=feed.current.scrollHeight-height;});
      return true;
    } finally {loadingOlder.current=false;if(mounted.current)setOlderBusy(false);}
  }
  async function older(){setError('');try{await loadOlder();}catch{setError('We couldn’t load earlier messages. Try again.');}}
  const jumpTo=useCallback(async(id:string)=>{
    askedFor.current=id;setError('');
    try {
      if(!document.getElementById('message-'+id)){
        const {data,response}=await getBrowserApi(token.current).GET('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}',{params:{path:{familyId,channelId,messageId:id}}});
        if(!data){setError(response.status===404?'That message is no longer available.':'We couldn’t open that message. Try again.');return;}
        while(mounted.current&&askedFor.current===id&&earliest.current>data.position&&before.current!==null){
          if(loadingOlder.current)await new Promise(done=>setTimeout(done,100));
          else if(!await loadOlder(100))break;
        }
      }
      // Two frames: one for the list to render, one for the scroll kept by loading older messages.
      requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const row=document.getElementById('message-'+id);if(!row||askedFor.current!==id)return;
        nearBottom.current=false;row.scrollIntoView({block:row.offsetHeight>(feed.current?.clientHeight??0)/2?'start':'center'});row.focus({preventScroll:true});setHighlighted(id);
        setTimeout(()=>{if(mounted.current)setHighlighted(old=>old===id?null:old);},2500);
      })));
    } catch {setError('We couldn’t open that message. Try again.');}
  // loadOlder only reads refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[familyId,channelId]);
  // The list beside the conversation shows this device’s own changes without waiting for a signal.
  const newest=messages.at(-1),newestKey=newest?newest.id+newest.changeSeq:"";
  useEffect(()=>{if(newestKey)window.dispatchEvent(new Event("famsync:chats"));},[newestKey]);
  const updateQueue=useCallback((change:(items:Outgoing[])=>Outgoing[])=>{
    queue.current=change(queue.current);saveDraft(session.user.id,channelId,{outgoing:queue.current});
    if(mounted.current)setOutgoing(queue.current);
  },[session.user.id,channelId]);
  // Messages are sent one at a time so they keep their order. Each keeps its ID until it is saved or discarded.
  const flush=useCallback(async()=>{
    if(flushing.current)return;flushing.current=true;
    try {
      for(;;){
        const item=queue.current.find(entry=>entry.state==='sending');if(!item||!access.current)break;
        const fail=(error:string,refused:boolean)=>updateQueue(items=>items.map(entry=>entry.id===item.id?{...entry,state:'failed',error,refused}:entry));
        try {
          const {data,error,response}=await getBrowserApi(token.current).POST('/api/v1/families/{familyId}/channels/{channelId}/messages',{
            params:{path:{familyId,channelId}},body:{id:item.id,body:item.body,replyToId:item.reply?.id??null,mentionedUserIds:item.mentions,fileIds:item.files.map(f=>f.id)},signal:AbortSignal.timeout(30000)});
          if(data){updateQueue(items=>items.filter(entry=>entry.id!==item.id));if(mounted.current){setMessages(old=>merge(old,[data]));latest.current=Math.max(latest.current,data.position);}}
          else {
            const refused=[400,403,404,409].includes(response.status);
            fail(familyError(refused?error:undefined,'We couldn’t send this message. Try again.'),refused);
            if(refused&&mounted.current)refresh();
          }
        } catch {fail(uncertain,false);}
      }
    } finally {flushing.current=false;}
  },[familyId,channelId,updateQueue,refresh]);
  // A message that did arrive is dropped from the unsent list, for example after a reload or in a second tab.
  useEffect(()=>{
    const arrived=new Set(messages.map(m=>m.id));
    if(queue.current.some(item=>item.state==='failed'&&arrived.has(item.id)))updateQueue(items=>items.filter(item=>!arrived.has(item.id)));
  },[messages,updateQueue]);
  useEffect(()=>{
    const online=()=>{if(queue.current.some(item=>item.state==='failed'&&!item.refused)){updateQueue(items=>items.map(item=>item.refused?item:{...item,state:'sending'}));void flush();}};
    window.addEventListener('online',online);return()=>window.removeEventListener('online',online);
  },[flush,updateQueue]);
  useEffect(()=>{if(loaded.current)saveDraft(session.user.id,channelId,{reply,files:selectedFiles});},[reply,selectedFiles,session.user.id,channelId]);
  const setUploadState=useCallback((change:(items:Upload[])=>Upload[])=>{uploadQueue.current=change(uploadQueue.current);if(mounted.current)setUploads(uploadQueue.current);},[]);
  const runUploads=useCallback(async()=>{
    if(uploadBusy.current)return;
    for(;;){
      const item=uploadQueue.current.find(entry=>!entry.error);if(!item||!mounted.current)return;
      const stop=new AbortController();uploadBusy.current={id:item.id,stop};
      try {
        const stored=await uploadChatFile({familyId,channelId,id:item.id,file:item.file,token:token.current,signal:stop.signal,
          onProgress:progress=>setUploadState(items=>items.map(entry=>entry.id===item.id?{...entry,progress}:entry))});
        uploaded.current.set(stored.id,stored.version);
        setUploadState(items=>items.filter(entry=>entry.id!==item.id));
        if(mounted.current&&access.current)setSelectedFiles(files=>[...files,{id:stored.id,fileName:stored.fileName}]);
      } catch(problem) {
        setUploadState(items=>items.map(entry=>entry.id===item.id?{...entry,error:problem instanceof Error?problem.message:'We couldn’t upload this file.'}:entry));
      } finally {uploadBusy.current=null;}
    }
  },[familyId,channelId,setUploadState]);
  function addFiles(files:File[]) {
    if(!files.length)return;setError('');
    const space=5-filesRef.current.length-uploadQueue.current.length,problems:string[]=[],accepted:Upload[]=[];
    for(const file of files){
      const problem=fileProblem(file);
      if(problem)problems.push(file.name+': '+problem);
      else if(accepted.length>=space)problems.push(file.name+': a message can have up to five files.');
      else accepted.push({id:crypto.randomUUID(),file,progress:0});
    }
    if(problems.length)setError(problems.join(' '));
    setUploadState(items=>[...items,...accepted]);void runUploads();
  }
  function removeUpload(id:string) {
    if(uploadBusy.current?.id===id)uploadBusy.current.stop.abort();
    setUploadState(items=>items.filter(item=>item.id!==id));
  }
  function removeFile(file:DraftFile) {
    setSelectedFiles(files=>files.filter(item=>item.id!==file.id));
    // A file uploaded for this message and then removed is not left behind in the chat's folder.
    const version=uploaded.current.get(file.id);
    if(version!==undefined)void getBrowserApi(token.current).PUT('/api/v1/families/{familyId}/files/{fileId}/archive',{params:{path:{familyId,fileId:file.id}},body:{version,archived:true}}).catch(()=>{});
  }
  function endEdit() {
    const back=beforeEdit.current??{body:'',mentions:[]};beforeEdit.current=null;setEditTarget(null);
    draft.current=back;setSeed(old=>({...back,key:old.key+1}));
  }
  async function saveEdit(next:Draft) {
    const target=editTarget;if(!target)return;
    // Keep the text in the box until the server accepts it.
    setSeed(old=>({...next,key:old.key+1}));draft.current=next;setBusy(true);setError('');
    try {
      const {data,error,response}=await getBrowserApi(token.current).PUT('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}',{
        params:{path:{familyId,channelId,messageId:target.id}},body:{editCount:target.editCount,body:next.body,mentionedUserIds:next.mentions}});
      if(data){setMessages(old=>merge(old,[data]));endEdit();setNote('Message edited.');}
      else {setError(familyError([400,403,404,409].includes(response.status)?error:undefined,'We couldn’t save this edit. Try again.'));refresh();}
    } catch {setError('We couldn’t save this edit. Try again.');}finally{setBusy(false);}
  }
  async function sendVoice(voice:Recording,signal:AbortSignal,onProgress:(percent:number)=>void) {
    const stored=await uploadChatFile({familyId,channelId,id:voice.id,file:voice.file,token:token.current,signal,onProgress,voiceSeconds:voice.seconds});
    if(!mounted.current||!access.current)return;
    nearBottom.current=true;setAtBottom(true);setUnreadAfter(null);setNote('');setError('');
    const item:Outgoing={id:crypto.randomUUID(),body:'',reply,mentions:[],files:[{id:stored.id,fileName:'Voice message'}],createdAt:new Date().toISOString(),state:'sending'};
    setReply(null);setRecording(false);updateQueue(items=>[...items,item]);void flush();
  }
  function send(next:Draft) {
    if(editTarget){void saveEdit(next);return;}
    signalTyping(false);
    nearBottom.current=true;setAtBottom(true);setUnreadAfter(null);setNote('');setError('');
    const item:Outgoing={id:crypto.randomUUID(),body:next.body,reply,mentions:next.mentions,files:selectedFiles,createdAt:new Date().toISOString(),state:'sending'};
    draft.current={body:'',mentions:[]};
    saveDraft(session.user.id,channelId,{body:'',mentions:[],reply:null,files:[]});
    for(const file of selectedFiles)uploaded.current.delete(file.id);
    setReply(null);setSelectedFiles([]);updateQueue(items=>[...items,item]);void flush();
  }
  const react=useCallback(async(message:ChannelMessage,emoji:string)=>{
    setBusy(true);setError('');setNote('');
    try {
      const {data,error}=await getBrowserApi(token.current).PUT('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/reaction',{
        params:{path:{familyId,channelId,messageId:message.id}},body:{emoji,active:!message.reactions.find(r=>r.emoji===emoji)?.active}});
      if(!data){setError(familyError(error,'We couldn’t save your reaction. Try again.'));return;}
      setMessages(old=>merge(old,[data]));
    } catch {setError('We couldn’t save your reaction. Try again.');}finally{setBusy(false);}
  },[familyId,channelId]);
  const mark=useCallback(async(message:ChannelMessage,kind:'star'|'pin')=>{
    setBusy(true);setError('');setNote('');
    try {
      const api=getBrowserApi(token.current),options={params:{path:{familyId,channelId,messageId:message.id}}};
      const {data,error}=kind==='star'?await api.PUT('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/star',{...options,body:{starred:!message.starred}})
        :await api.PUT('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/pin',{...options,body:{pinned:!message.pinned}});
      if(!data){setError(familyError(error,'We couldn’t save this. Try again.'));return;}
      setMessages(old=>merge(old,[data]));if(kind==='pin')refresh();
    } catch {setError('We couldn’t save this. Try again.');}finally{setBusy(false);}
  },[familyId,channelId,refresh]);
  async function removeMessage(message:ChannelMessage) {
    const {data,error}=await getBrowserApi(token.current).DELETE('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}',{params:{path:{familyId,channelId,messageId:message.id}}});
    if(!data)return familyError(error,'We couldn’t delete this message. Try again.');
    setMessages(old=>merge(old,[data]));if(editTarget?.id===message.id)endEdit();if(reply?.id===message.id)setReply(null);refresh();
  }
  async function leaveChannel() {
    const {data,error}=await getBrowserApi(token.current).POST('/api/v1/families/{familyId}/channels/{channelId}/leave',{params:{path:{familyId,channelId}}});
    if(!data)return familyError(error,'We couldn’t leave this channel. Try again.');
    removeDraft(session.user.id,channelId);window.location.assign(guest?'/guests/':'/messages/?'+new URLSearchParams({family:familyId}));
  }
  async function changeAdmin(userId:string,change:'add'|'remove'|'manager') {
    if(!channel||busy)return;setBusy(true);setError('');setNote('');
    try {
      const api=getBrowserApi(token.current);
      const {data,error}=change==='manager'?await api.PUT('/api/v1/families/{familyId}/channels/{channelId}/manager',{params:{path},body:{version:channel.version,userId}})
        :await api.PUT('/api/v1/families/{familyId}/channels/{channelId}/admins/{userId}',{params:{path:{...path,userId}},body:{version:channel.version,admin:change==='add'}});
      if(data){setChannel(data);setNote('Channel roles updated.');}else{setError(familyError(error,'We couldn’t change this role. Try again.'));refresh();}
    } catch {setError('We couldn’t change this role. Try again.');}finally{setBusy(false);}
  }
  // Opening a chat marked unread clears the mark even when there is nothing new to read.
  const markedUnread=channel?.markedUnread;
  useEffect(()=>{
    if(!markedUnread)return;
    void getBrowserApi(token.current).PUT('/api/v1/families/{familyId}/channels/{channelId}/preferences',{params:{path:{familyId,channelId}},body:{unread:false}}).catch(()=>{});
  },[markedUnread,familyId,channelId]);
  const actions=useMemo<FeedActions>(()=>({
    forward:setForwarding,remove:setDeleting,info:setInfoFor,
    star:message=>void mark(message,'star'),
    pin:message=>void mark(message,'pin'),
    editMessage:message=>{
      beforeEdit.current??=draft.current;
      const next={body:message.body,mentions:message.mentions.map(person=>person.userId)};
      draft.current=next;setReply(null);setEditTarget(message);setSeed(old=>({...next,key:old.key+1}));composer.current?.focus();
    },
    react:(message,emoji)=>void react(message,emoji),
    reply:message=>{setReply({id:message.id,body:replyText({body:message.body.slice(0,180),deleted:false,fileCount:message.files.length,attachment:message.files[0]?.voiceSeconds?'voice':message.files[0]?.mime?.startsWith('image/')?'photo':message.files[0]?.mime?.startsWith('video/')?'video':'file'}),author:message.author?.userId===session.user.id?'You':message.author?.name??'Former member'});composer.current?.focus();},
    copy:message=>{navigator.clipboard?.writeText(message.body).then(()=>{setError('');setNote('Message copied.');},()=>setError('We couldn’t copy this message.'))??setError('Copying is not available in this browser.');},
    jump:id=>void jumpTo(id),
    toggleTools:id=>setToolsFor(old=>old===id?null:id),
    changed:refresh,
    retry:id=>{updateQueue(items=>items.map(item=>item.id===id?{...item,state:'sending',error:undefined,refused:false}:item));void flush();},
    discard:id=>updateQueue(items=>items.filter(item=>item.id!==id)),
    edit:id=>{
      const item=queue.current.find(entry=>entry.id===id);if(!item)return;
      if(draft.current.body.trim()){setError('Send or clear the message you are writing first.');return;}
      updateQueue(items=>items.filter(entry=>entry.id!==id));
      draft.current={body:item.body,mentions:item.mentions};saveDraft(session.user.id,channelId,draft.current);
      setSeed(old=>({...draft.current,key:old.key+1}));setReply(item.reply);setSelectedFiles(item.files);composer.current?.focus();
    },
  }),[react,mark,jumpTo,refresh,updateQueue,flush,session.user.id,channelId]);
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
  const back=channel&&!channel.canCreateWork?'/guests/':'/messages/?'+new URLSearchParams({family:familyId});
  const backLabel=channel&&!channel.canCreateWork?'All guest channels':'All chats';
  const guestIds=useMemo(()=>new Set(channel?.members.filter(m=>m.guest).map(m=>m.userId)??[]),[channel]);
  const typists=channel?.members.filter(m=>m.userId in typing).map(m=>m.name)??[];
  const typingLabel=typists.length===0?'':typists.length===1?(channel?.kind==='dm'?'typing…':typists[0]+' is typing…'):typists.length===2?typists.join(' and ')+' are typing…':'Several people are typing…';
  const showList=!guest&&!!channel;
  const directPeer=channel?.kind==='dm'?channel.members.find(member=>member.userId!==session.user.id):undefined;
  return <>
    <a href={back} className={cn('mt-4 mb-1 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4',showList&&'lg:hidden')}><ArrowLeft className="size-4" aria-hidden="true" />{backLabel}</a>
    {loadError&&<div className="my-4 grid justify-items-start gap-2"><FormFeedback error={loadError} /><Button variant="outline" onClick={refresh}>Refresh conversation</Button></div>}
    {!channel&&!loadError&&<div className="my-4"><FormFeedback note="Loading conversation…" /></div>}
    {channel&&<div className={cn(workspaceFrame,'grid lg:mt-6',showList?'lg:grid-cols-[18rem_minmax(0,1fr)]':'grid-cols-1',detailsOpen&&(showList?'xl:grid-cols-[18rem_minmax(0,1fr)_18rem]':'xl:grid-cols-[minmax(0,1fr)_18rem]'))}>
      {showList&&<nav aria-label="Conversations" className="hidden min-h-0 border-r border-border lg:flex lg:flex-col"><ConversationList session={session} familyId={familyId} activeId={channel.id} pane /></nav>}
      <article className="relative flex min-h-0 min-w-0 flex-col" aria-labelledby="conversation-title"
        onDragOver={event=>{if(!channel.archived&&!editTarget&&event.dataTransfer.types.includes('Files')){event.preventDefault();setDragging(true);}}}
        onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false);}}
        onDrop={event=>{setDragging(false);if(channel.archived||editTarget||!event.dataTransfer.files.length)return;event.preventDefault();addFiles(Array.from(event.dataTransfer.files));}}>
        {dragging&&<div aria-hidden="true" className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-panel/90 text-sm font-medium">Drop files to attach</div>}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {directPeer?<Avatar name={directPeer.name} colorKey={directPeer.userId} className="size-12" />:<ChannelAvatar familyId={familyId} channelId={channel.id} imageFileId={channel.imageFileId} emoji={channel.emoji} accessToken={session.access_token}/>}
            <div className="min-w-0">
              <h1 id="conversation-title" className="truncate text-base font-semibold">{channel.name}</h1>
              <p className="truncate text-xs text-muted-foreground">{typingLabel?<span className="font-medium text-foreground">{typingLabel}</span>:channel.kind==='dm'?(directPeer?.online?'Online':directPeer?.lastSeen?seenLabel(directPeer.lastSeen):'Direct conversation'):channel.topic||channel.memberCount+(channel.memberCount===1?' member':' members')}{channel.muted?' · Muted':''}{channel.archived?' · Archived':''}</p>
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
        {channel.pins.length>0&&<ul aria-label="Pinned messages" className="grid grid-cols-1 border-b border-border">{channel.pins.map(pin=><li key={pin.id}><button type="button" className="flex w-full min-w-0 items-center gap-2 px-4 py-1.5 text-left text-xs hover:bg-accent" onClick={()=>void jumpTo(pin.id)}>
          <Pin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /><span className="shrink-0 font-medium">{pin.author?.userId===session.user.id?'You':pin.author?.name??'Former member'}</span><span className="truncate text-muted-foreground">{pin.body||attachmentLabel(pin.attachment,pin.fileCount)}</span></button></li>)}</ul>}
        <p role="status" className="sr-only">{typingLabel}</p>
        <div ref={feed} className="relative max-h-[60dvh] min-h-48 overflow-y-auto px-3 py-4 sm:px-5 lg:max-h-none lg:flex-1" tabIndex={0} aria-label="Conversation history"
          onScroll={()=>{const el=feed.current;if(!el)return;const bottom=el.scrollHeight-el.scrollTop-el.clientHeight<50;if(bottom)nearBottom.current=true;else if(el.scrollTop<lastTop.current-2)nearBottom.current=false;lastTop.current=el.scrollTop;setAtBottom(nearBottom.current);if(bottom)void markRead(messages.at(-1)?.position??0);}}>
          {nextBefore!==null&&<div className="mb-4 text-center"><Button variant="outline" disabled={olderBusy} onClick={()=>void older()}>{olderBusy?'Loading history…':'Load earlier messages'}</Button></div>}
          {messages.length===0&&outgoing.length===0&&<EmptyState icon="messages" tone="lavender" title="No messages yet" className="border-0">Start the conversation. Send the first message.</EmptyState>}
          <ChatFeed session={session} familyId={familyId} channel={channel} messages={messages} outgoing={outgoing} unreadAfter={unreadAfter} busy={busy} toolsFor={toolsFor} highlighted={highlighted} guestIds={guestIds} actions={actions} />
        </div>
        {!atBottom&&<div className="flex justify-center border-t border-border py-2"><Button variant="outline" className="gap-1.5" onClick={jump}><ArrowDown aria-hidden="true" />Jump to latest messages</Button></div>}
        {!channel.archived&&<div className="grid gap-2 border-t border-border p-3 sm:p-4">
          {!editTarget&&(!!selectedFiles.length||!!uploads.length)&&<ul aria-label="Files to send" className="flex flex-wrap gap-2">
            {selectedFiles.map(f=><li key={f.id} className="flex min-w-0 items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-xs"><Paperclip aria-hidden="true" className="size-3 shrink-0" /><span className="max-w-48 truncate">{f.fileName}</span><Button aria-label={'Remove '+f.fileName} variant="ghost" className="h-6 px-2 text-xs" onClick={()=>removeFile(f)}>Remove</Button></li>)}
            {uploads.map(item=><li key={item.id} className="flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-xl bg-muted py-1 pr-1 pl-3 text-xs"><span className="max-w-48 truncate">{item.file.name}</span>
              {item.error?<><span role="alert" className="text-destructive">{item.error}</span><Button variant="ghost" className="h-6 px-2 text-xs" onClick={()=>{setUploadState(items=>items.map(entry=>entry.id===item.id?{...entry,error:undefined,progress:0}:entry));void runUploads();}}>Retry</Button></>
                :<progress aria-label={'Uploading '+item.file.name} max={100} value={item.progress} className="w-16" />}
              <Button aria-label={'Cancel '+item.file.name} variant="ghost" className="h-6 px-2 text-xs" onClick={()=>removeUpload(item.id)}>{item.error?'Remove':'Cancel'}</Button></li>)}
          </ul>}
          {editTarget&&<div className="flex min-w-0 items-center justify-between gap-2 rounded-xl border-l-2 border-lavender-foreground bg-muted p-2.5 text-xs"><p className="min-w-0 truncate"><span className="font-semibold">Editing</span> {editTarget.body}</p>
            <Button variant="ghost" className="h-7 shrink-0 px-2 text-xs" disabled={busy} onClick={endEdit}>Cancel edit</Button></div>}
          {reply&&!editTarget&&<div className="flex min-w-0 items-start justify-between gap-2 rounded-xl border-l-2 border-lavender-foreground bg-muted p-2.5"><div className="min-w-0 text-xs"><p className="font-semibold">Replying to {reply.author}</p><p className="mt-0.5 truncate">{reply.body}</p></div>
            <Button variant="ghost" className="h-7 shrink-0 px-2 text-xs" onClick={()=>setReply(null)}>Cancel reply</Button></div>}
          {recording?<VoiceRecorder onSend={sendVoice} onClose={()=>setRecording(false)} />:<ChatComposer textarea={composer} seed={seed} members={channel.members} userId={session.user.id} replying={!!reply} editing={!!editTarget} attached={editTarget?editTarget.files.length:selectedFiles.length} uploading={!editTarget&&uploads.length>0} canAttach={selectedFiles.length+uploads.length<5}
            onAttach={()=>setPickingFiles(true)} onFiles={addFiles} onVoice={()=>{const empty={body:'',mentions:[]};draft.current=empty;setSeed(old=>({...empty,key:old.key+1}));setRecording(true);}} onChange={next=>{draft.current=next;if(!editTarget)signalTyping(!!next.body.trim());if(!editTarget)saveDraft(session.user.id,channelId,next);}} onSend={send} />}
        </div>}
      </article>
      <aside id="conversation-details" ref={detailsPanel} tabIndex={-1} aria-label="Conversation details"
        className={cn('min-h-0 overflow-y-auto border-border bg-panel outline-none xl:border-l',
          detailsOpen?'fixed inset-y-0 right-0 z-40 block w-[min(22rem,92vw)] border-l shadow-xl xl:static xl:z-auto xl:w-auto xl:shadow-none':'hidden')}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3"><h2 className="text-base font-semibold">Details</h2>
          <Button variant="ghost" size="icon" aria-label="Close details" onClick={()=>{setDetailsOpen(false);detailsButton.current?.focus();}}><X aria-hidden="true" /></Button></div>
        <div className="grid gap-4 p-4">
          {channel.description&&<p className="text-sm wrap-anywhere whitespace-pre-wrap text-muted-foreground">{channel.description}</p>}
          <a className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-muted" href={foldersPath(familyId,channel.id,!channel.canCreateWork)}><ModuleIcon name="folders" className="size-4" />Files and folders</a>
          <MessageSearch compact familyId={familyId} accessToken={session.access_token} conversationId={channel.id} guest={!channel.canCreateWork} />
          <details className="group border-t border-border pt-1" open>
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>Members <span className="ml-1 text-muted-foreground">{channel.memberCount}</span></span><ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
            <ul className="grid gap-3 py-2">{channel.members.map(member=><li className="flex min-w-0 items-center gap-2.5 text-sm" key={member.userId}><Avatar name={member.name} colorKey={member.userId} size="sm" />
              <span className="min-w-0 truncate">{member.name}</span>{member.online&&<span className="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Online" title="Online" />}{member.guest&&<Badge tone="peach">Guest</Badge>}{member.userId===channel.manager?.userId?<Badge tone="outline">Manager</Badge>:member.admin&&<Badge tone="outline">Admin</Badge>}
              {channel.canManage&&!member.guest&&member.userId!==channel.manager?.userId&&<Menu.Root>
                <Menu.Trigger disabled={busy} aria-label={'Roles for '+member.name} title="Roles" className="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-50"><Ellipsis aria-hidden="true" className="size-4" /></Menu.Trigger>
                <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50"><Menu.Popup className={cn(floatingPanel,'min-w-44')}>
                  <Menu.Item className={menuItem} onClick={()=>void changeAdmin(member.userId,member.admin?'remove':'add')}>{member.admin?'Remove as admin':'Make admin'}</Menu.Item>
                  {channel.isManager&&<Menu.Item className={menuItem} onClick={()=>void changeAdmin(member.userId,'manager')}>Make manager instead of me</Menu.Item>}
                </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>}</li>)}</ul>
            {channel.kind==='channel'&&<Button variant="ghost" className="mt-1 justify-start px-2 text-sm text-destructive" disabled={busy} onClick={()=>setLeaving(true)}><LogOut aria-hidden="true" />Leave channel</Button>}
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
    {pickingFiles&&channel&&<ConversationFilePicker session={session} familyId={familyId} channel={channel} onClose={()=>setPickingFiles(false)} onPick={async file=>{setSelectedFiles(fs=>fs.some(f=>f.id===file.id)?fs:[...fs,{id:file.id,fileName:file.fileName}]);}}/>}
    {forwarding&&<ForwardDialog session={session} familyId={familyId} channelId={channelId} message={forwarding} onClose={()=>setForwarding(null)} onDone={setNote} />}
    {deleting&&<ConfirmDialog title="Delete for everyone?" description="The message and its reactions are removed for everyone. Files sent with it are archived. People may already have seen it." action="Delete" onConfirm={()=>removeMessage(deleting)} onClose={()=>setDeleting(null)} />}
    {infoFor&&channel&&<MessageInfoDialog channel={channel} message={infoFor} people={receiptPeople(channel,infoFor)} onClose={()=>setInfoFor(null)} />}
    {leaving&&channel&&<ConfirmDialog title={'Leave '+channel.name+'?'} description="You will lose access to its messages and files. An admin can add you again." action="Leave" onConfirm={leaveChannel} onClose={()=>setLeaving(false)} />}
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
export function ChannelScreen({guest=false}:{direct?:boolean;guest?:boolean}){return <AppShell guestMode={guest} activePage={guest?'guests':'messages'}><div className="pb-4"><FamilySession>{session=><ChannelRoute key={session.user.id} session={session} guest={guest} />}</FamilySession></div></AppShell>;}
