"use client";
import {Dialog} from '@base-ui/react/dialog';
import type {Session} from '@supabase/auth-js';
import type {components} from '@famsync/api-client';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {getBrowserApi} from '@/lib/browser-auth';
import type {ChannelDetail,ChannelMessage} from '@/lib/channels';
import {Field,FormFeedback,inputClass} from './account-fields';
import {familyError} from './family-session';
import {Button} from './ui/button';
type Props={session:Session;familyId:string;channel:ChannelDetail;message:ChannelMessage;onChanged:()=>void};
function WorkDialog({title,description,busy,onClose,children}:{title:string;description:string;busy:boolean;onClose:()=>void;children:ReactNode}){
 return <Dialog.Root open disablePointerDismissal onOpenChange={v=>{if(!v&&!busy)onClose();}}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
  <Dialog.Popup className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl">
   <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm text-muted-foreground">{description}</Dialog.Description>{children}
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
function MessageTaskDialog({session,familyId,channel,message,onChanged,onClose}:{onClose:()=>void}&Props){
 const [snapshot,setSnapshot]=useState(channel),[title,setTitle]=useState(message.body.slice(0,120)),[description,setDescription]=useState(''),[due,setDue]=useState('');
 const others=snapshot.members.filter(m=>!m.guest&&m.userId!==session.user.id);
 const [audience,setAudience]=useState<'private'|'selected'>(others.length?'selected':'private'),[selected,setSelected]=useState(others.map(m=>m.userId)),[assignee,setAssignee]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const id=useRef('');
 const eligible=snapshot.members.filter(m=>!m.guest&&(m.userId===session.user.id||audience==='selected'&&selected.includes(m.userId)));
 useEffect(()=>{if(assignee&&!eligible.some(m=>m.userId===assignee))setAssignee('');},[audience,selected,assignee,snapshot]);
 async function reload(){setBusy(true);try{const {data}=await getBrowserApi(session.access_token).GET('/api/v1/families/{familyId}/channels/{channelId}',{params:{path:{familyId,channelId:channel.id}}});if(!data)throw new Error();setSnapshot(data);setSelected(ids=>ids.filter(id=>data.members.some(m=>!m.guest&&m.userId===id)));setError('');}catch{setError('We couldn’t reload this conversation. Your task draft is kept.');}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();if(busy)return;setError('');if(audience==='selected'&&!selected.length){setError('Choose at least one conversation member.');return;}
  setBusy(true);id.current||=crypto.randomUUID();try{
   const {data,error}=await getBrowserApi(session.access_token).POST('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/tasks',{
    params:{path:{familyId,channelId:channel.id,messageId:message.id}},body:{id:id.current,title:title.trim(),description:description.trim(),audience,selectedMemberIds:audience==='selected'?selected:[],assigneeId:assignee||null,dueDate:due||null,remindMinutes:null,conversationVersion:snapshot.version},
   });if(data){onChanged();onClose();return;}setError(familyError(error,'We couldn’t create this task. Try again.'));
  }catch{setError('We couldn’t create this task. Try again.');}finally{setBusy(false);}}
 return <WorkDialog title="Create task from message" description="Review the task and who can see it before saving." busy={busy} onClose={onClose}>
  <form className="mt-5 grid gap-4" onSubmit={e=>void save(e)}><fieldset disabled={busy} className="grid min-w-0 gap-4">
   <Field id="message-task-title" label="Task title"><input id="message-task-title" className={inputClass} required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} /></Field>
   <Field id="message-task-notes" label="Task description"><textarea id="message-task-notes" className={inputClass} rows={2} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} /></Field>
   <Field id="message-task-audience" label="Who can see this task?"><select id="message-task-audience" className={inputClass} value={audience} onChange={e=>setAudience(e.target.value as typeof audience)}><option value="private">Only me</option><option value="selected">Selected conversation members</option></select></Field>
   {audience==='selected'&&<fieldset className="grid gap-2"><legend className="mb-2 text-sm font-semibold">Share task with</legend>{others.map(m=><label className="flex gap-2 text-sm" key={m.userId}><input type="checkbox" checked={selected.includes(m.userId)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,m.userId]:ids.filter(id=>id!==m.userId))} />{m.name}</label>)}</fieldset>}
   <Field id="message-task-assignee" label="Task assignee"><select id="message-task-assignee" className={inputClass} value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{eligible.map(m=><option key={m.userId} value={m.userId}>{m.name}</option>)}</select></Field>
   <Field id="message-task-due" label="Task due date"><input id="message-task-due" className={inputClass} type="date" value={due} onChange={e=>setDue(e.target.value)} /></Field>
   <p className="text-sm text-muted-foreground">{audience==='private'?'Visible only to you.':'Visible to you and '+selected.length+' selected conversation members.'} The task keeps an authorized source link.</p>
  </fieldset><FormFeedback error={error} />{error&&<Button variant="outline" disabled={busy} onClick={()=>void reload()}>Reload conversation</Button>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy||!title.trim()}>{busy?'Saving…':'Create task'}</Button></div></form>
 </WorkDialog>;
}
function MessageEventDialog({session,familyId,channel,message,onChanged,onClose}:{onClose:()=>void}&Props){
 const [version,setVersion]=useState(channel.version),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[events,setEvents]=useState<components['schemas']['LinkableEventDto'][]>([]);
 const [cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const id=useRef('');
 async function reload(){setBusy(true);try{const {data}=await getBrowserApi(session.access_token).GET('/api/v1/families/{familyId}/channels/{channelId}',{params:{path:{familyId,channelId:channel.id}}});if(!data)throw new Error();setVersion(data.version);setError('');}catch{setError('We couldn’t reload this conversation. Your event selection is kept.');}finally{setBusy(false);}}
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');void getBrowserApi(session.access_token).GET('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/events',{
  params:{path:{familyId,channelId:channel.id,messageId:message.id},query:{q:search||undefined,cursor:cursor??undefined}},signal:c.signal,
 }).then(({data})=>{if(c.signal.aborted)return;if(!data)throw new Error();setEvents(old=>cursor?[...new Map([...old,...data.events].map(e=>[e.id,e])).values()]:data.events);setNext(data.nextCursor);})
  .catch(()=>{if(!c.signal.aborted)setError('We couldn’t load visible events. Try again.');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[session.access_token,familyId,channel.id,message.id,search,cursor,revision]);
 async function link(e:FormEvent){e.preventDefault();if(busy||!selected)return;id.current||=crypto.randomUUID();setBusy(true);setError('');try{
  const {data,error}=await getBrowserApi(session.access_token).POST('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/events',{
   params:{path:{familyId,channelId:channel.id,messageId:message.id}},body:{id:id.current,eventId:selected,version},
  });if(data){onChanged();onClose();return;}setError(familyError(error,'We couldn’t link this event. Try again.'));
 }catch{setError('We couldn’t link this event. Try again.');}finally{setBusy(false);}}
 return <WorkDialog title="Link an event" description="Event details are visible only to people who can already open the event. Message text is not copied to it." busy={busy} onClose={onClose}>
  <form className="mt-5 flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();setCursor(null);setEvents([]);setSearch(query.trim());setRevision(v=>v+1);}}><div className="min-w-0 grow"><Field id="message-event-search" label="Search events"><input id="message-event-search" className={inputClass} maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} /></Field></div><Button variant="outline" type="submit" disabled={loading||busy}>Search events</Button></form>
  <FormFeedback error={error} note={loading?'Loading visible events…':undefined} />
  {error&&<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Retry events</Button><Button variant="outline" disabled={busy} onClick={()=>void reload()}>Reload conversation</Button></div>}
  <form className="mt-4 grid gap-4" onSubmit={e=>void link(e)}><Field id="message-event-choice" label="Event to link"><select id="message-event-choice" className={inputClass+' w-full'} required value={selected} disabled={loading||busy} onChange={e=>{setSelected(e.target.value);id.current='';}}><option value="">Choose an event</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
   {!loading&&!events.length&&!error&&<p className="text-sm text-muted-foreground">No visible events match this search.</p>}
   {next&&<Button variant="ghost" disabled={loading||busy} onClick={()=>setCursor(next)}>More events</Button>}
   <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy||loading||!selected}>{busy?'Saving…':'Link event'}</Button></div>
  </form></WorkDialog>;
}
export function MessageWorkTools({actions=true,...props}:Props&{actions?:boolean}){
 const [mode,setMode]=useState<'task'|'event'>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 async function unlink(work:ChannelMessage['work'][number]){setBusy(true);setError('');setNote('');try{
  const {data,error}=await getBrowserApi(props.session.access_token).DELETE('/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/work/{kind}/{workId}',{
   params:{path:{familyId:props.familyId,channelId:props.channel.id,messageId:props.message.id,kind:work.kind,workId:work.id}},body:{version:work.version},
  });if(data){setNote('Work link removed.');props.onChanged();}else setError(familyError(error,'We couldn’t remove this link. Try again.'));
 }catch{setError('We couldn’t remove this link. Try again.');}finally{setBusy(false);}}
 return <div className="mt-1 grid gap-2 empty:hidden">
  {actions&&props.channel.canCreateWork&&<div className="flex flex-wrap gap-1"><Button variant="ghost" className="h-9 px-2 text-xs" disabled={busy||props.channel.archived} onClick={()=>{setMode('task');setNote('');}}>Create task</Button><Button variant="ghost" className="h-9 px-2 text-xs" disabled={busy||props.channel.archived} onClick={()=>{setMode('event');setNote('');}}>Link event</Button></div>}
  {!!props.message.work.length&&<ul className="grid gap-2" aria-label="Linked work">{props.message.work.map(work=><li key={work.kind+work.id} className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-border bg-panel p-2 text-sm">
   {work.path?<a className="underline underline-offset-4 wrap-anywhere" href={work.path}>{work.kind==='task'?'Task: ':'Event: '}{work.title}</a>:<span className="text-muted-foreground">Linked {work.kind} unavailable</span>}
   {work.canUnlink&&<Button variant="ghost" className="h-8 shrink-0 px-2 text-xs" disabled={busy||props.channel.archived} aria-label={'Unlink '+(work.title??work.kind)} onClick={()=>void unlink(work)}>Unlink</Button>}
  </li>)}</ul>}
  <FormFeedback error={error} note={note} />
  {mode==='task'&&<MessageTaskDialog {...props} onClose={()=>setMode(undefined)} onChanged={()=>{setNote('Task created.');props.onChanged();}} />}
  {mode==='event'&&<MessageEventDialog {...props} onClose={()=>setMode(undefined)} onChanged={()=>{setNote('Event linked.');props.onChanged();}} />}
 </div>;
}
