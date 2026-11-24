"use client";
import type {Session} from '@supabase/auth-js';
import {LiveStatus} from './ui/live-status';
import {useEffect,useState} from 'react';
import {getBrowserApi} from '@/lib/browser-auth';
import {attachmentLabel,channelPath,type ChannelDetail,type ChannelMessage} from '@/lib/channels';
import {useChannelUpdates} from '@/lib/channel-updates';
import {AppShell} from './app-shell';
import {FamilySession} from './family-session';
import {FormFeedback} from './account-fields';
import {MessageWorkTools} from './message-work-tools';
import {MessageFiles} from './conversation-files';
import {Button} from './ui/button';
import {Avatar} from './ui/avatar';
import {PageHeader} from './ui/page-header';
function MessageDetails({session,onGuest}:{session:Session;onGuest:(guest:boolean)=>void}){
 const [params,setParams]=useState<{family:string;conversation:string;id:string}|null>(),[saved,setSaved]=useState<{channel:ChannelDetail;message:ChannelMessage}>();
 const [error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const q=new URLSearchParams(window.location.search),family=q.get('family'),conversation=q.get('conversation'),id=q.get('id');setParams(family&&conversation&&id?{family,conversation,id}:null);},[]);
 const connection=useChannelUpdates(session.user.id,params?[params.conversation]:[],()=>setRevision(v=>v+1));
 useEffect(()=>{if(!params)return;const c=new AbortController();async function load(){try{
  const api=getBrowserApi(session.access_token),path={familyId:params!.family,channelId:params!.conversation};
  const [channel,message]=await Promise.all([api.GET('/api/v1/families/{familyId}/channels/{channelId}',{params:{path},signal:c.signal}),
   api.GET('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}',{params:{path:{...path,messageId:params!.id}},signal:c.signal})]);
  if(c.signal.aborted)return;if(!channel.data||!message.data){setSaved(undefined);setError('Message unavailable. You may no longer have access.');return;}
  setSaved({channel:channel.data,message:message.data});onGuest(!channel.data.canCreateWork);setError('');
 }catch{if(!c.signal.aborted){setSaved(undefined);setError('We couldn’t load this message. Try again.');}}}void load();return()=>c.abort();},[session.access_token,params,revision]);
 if(params===null)return <FormFeedback error="Message not found." />;
 const back=saved&&params?(saved.channel.canCreateWork?channelPath(params.family,params.conversation,saved.channel.kind):'/guest-channel/?'+new URLSearchParams({family:params.family,id:params.conversation})):undefined;
 return <><PageHeader title="Source message" crumbs={saved&&back?[{label:saved.channel.name,href:back},{label:'Message'}]:undefined} /><FormFeedback error={error} note={!saved&&!error?'Loading message…':undefined} />
  {error&&<Button variant="outline" onClick={()=>setRevision(v=>v+1)}>Retry message</Button>}
  {saved&&params&&<article className="grid gap-4 rounded-2xl border border-border bg-panel p-5 sm:p-6">
   <div className="flex items-center gap-3"><Avatar name={saved.message.author?.name??'Former member'} colorKey={saved.message.author?.userId} />
    <p className="text-sm"><span className="font-medium">{saved.message.author?.name??'Former member'}</span>{saved.channel.members.some(m=>m.userId===saved.message.author?.userId&&m.guest)?' · Guest':''} <span className="text-muted-foreground">· {new Date(saved.message.createdAt).toLocaleString()}</span></p></div>
   {saved.message.replyTo&&<blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground">Reply to {saved.message.replyTo.author?.name??'Former member'}: {saved.message.replyTo.deleted?'Message deleted':saved.message.replyTo.body||attachmentLabel(saved.message.replyTo.attachment,saved.message.replyTo.fileCount)}</blockquote>}
   <p className="rounded-2xl rounded-tl-md bg-muted px-4 py-3 leading-relaxed wrap-anywhere whitespace-pre-wrap">{saved.message.deleted?'This message was deleted.':saved.message.body||'Attachment'}</p>
   {!!saved.message.mentions.length&&<p className="text-sm wrap-anywhere text-lavender-foreground">Mentions: {saved.message.mentions.map(m=>'@'+m.name).join(', ')}</p>}
   <a className="justify-self-start text-sm font-medium underline underline-offset-4 wrap-anywhere" href={back}>Open {saved.channel.name}</a>
   <LiveStatus state={connection} />
   {!saved.message.deleted&&<><MessageWorkTools session={session} familyId={params.family} channel={saved.channel} message={saved.message} onChanged={()=>setRevision(v=>v+1)} />
   <MessageFiles session={session} familyId={params.family} channel={saved.channel} message={saved.message} onChanged={()=>setRevision(v=>v+1)}/></>}
  </article>}
 </>;
}
export function MessageSourceScreen(){const [guest,setGuest]=useState(false);return <AppShell guestMode={guest} activePage={guest?'guests':'messages'}><div className="mx-auto max-w-3xl pb-4"><FamilySession>{session=><MessageDetails onGuest={setGuest} key={session.user.id} session={session} />}</FamilySession></div></AppShell>;}
