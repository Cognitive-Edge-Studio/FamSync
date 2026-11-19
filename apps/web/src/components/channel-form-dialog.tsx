"use client";
import { Dialog } from '@base-ui/react/dialog';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { components } from '@famsync/api-client';
import { getBrowserApi } from '@/lib/browser-auth';
import { channelPath, type ChannelDetail } from '@/lib/channels';
import { Field, FormFeedback, inputClass } from './account-fields';
import { familyError } from './family-session';
import { Button } from './ui/button';
type Member=components['schemas']['FamilyMemberDto'];
export function ChannelFormDialog({familyId,accessToken,userId,existing,onClose,onSaved}:{
  familyId:string;accessToken:string;userId:string;existing?:ChannelDetail;onClose:()=>void;onSaved?:(channel:ChannelDetail)=>void;
}) {
  const [name,setName]=useState(existing?.name??''),[emoji,setEmoji]=useState(existing?.emoji??'💬');
  const [topic,setTopic]=useState(existing?.topic??''),[description,setDescription]=useState(existing?.description??'');
  const [selected,setSelected]=useState(existing?.members.filter(m=>!m.guest).map(m=>m.userId)??[userId]);
  const [members,setMembers]=useState<Member[]>(),[error,setError]=useState(''),[loadError,setLoadError]=useState('');
  const [busy,setBusy]=useState(false),[revision,setRevision]=useState(0);const id=useRef(''),titleRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const controller=new AbortController();setLoadError('');
    void getBrowserApi(accessToken).GET('/api/v1/families/{familyId}/members',{params:{path:{familyId}},signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted){if(data)setMembers(data);else setLoadError('We couldn’t load family members.');}})
      .catch(()=>{if(!controller.signal.aborted)setLoadError('We couldn’t load family members.');});
    return ()=>controller.abort();
  },[accessToken,familyId,revision]);
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!members)return;setError('');setBusy(true);id.current||=crypto.randomUUID();
    const body={name:name.trim(),emoji,topic:topic.trim(),description:description.trim(),memberIds:selected};
    try {
      const api=getBrowserApi(accessToken);
      const {data,error,response}=existing?await api.PUT('/api/v1/families/{familyId}/channels/{channelId}',{
        params:{path:{familyId,channelId:existing.id}},body:{...body,version:existing.version}})
        :await api.POST('/api/v1/families/{familyId}/channels',{params:{path:{familyId}},body:{...body,id:id.current}});
      if(data){if(onSaved)onSaved(data);else window.location.assign(channelPath(familyId,data.id));return;}
      setError(familyError([400,403,404,409].includes(response.status)?error:undefined,'We couldn’t save this channel. Try again.'));
    } catch {setError('We couldn’t save this channel. Try again.');} finally {setBusy(false);}
  }
  return <Dialog.Root open disablePointerDismissal onOpenChange={open=>{if(!open&&!busy)onClose();}}>
    <Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
      <Dialog.Popup initialFocus={titleRef} className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
        <Dialog.Title className="text-xl font-semibold">{existing?'Edit channel':'New channel'}</Dialog.Title>
        <Dialog.Description className="mt-1 text-sm text-muted-foreground">Only selected current family members can open this conversation.</Dialog.Description>
        <form className="mt-5 grid gap-4" onSubmit={event=>void save(event)}>
          <fieldset className="grid min-w-0 gap-4" disabled={busy}>
            <Field id="channel-name" label="Channel name"><input ref={titleRef} id="channel-name" className={inputClass} required maxLength={80} value={name} onChange={e=>setName(e.target.value)} /></Field>
            <Field id="channel-emoji" label="Channel icon"><select id="channel-emoji" className={inputClass} value={emoji} onChange={e=>setEmoji(e.target.value)}>
              {['💬','🏠','📅','🎉','💡','🌱'].map(value=><option key={value} value={value}>{value}</option>)}
            </select></Field>
            <Field id="channel-topic" label="Topic"><input id="channel-topic" className={inputClass} maxLength={200} value={topic} onChange={e=>setTopic(e.target.value)} /></Field>
            <Field id="channel-description" label="Description"><textarea id="channel-description" className={inputClass} rows={3} maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} /></Field>
            <fieldset className="grid gap-2 rounded-xl border border-border p-3"><legend className="px-1 font-semibold">Channel members</legend>
              {!members&&<p className="text-sm text-muted-foreground">Loading members…</p>}
              {members?.map(member=><label key={member.userId} className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={selected.includes(member.userId)}
                  disabled={member.userId===(existing?.manager?.userId??userId)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,member.userId]:ids.filter(id=>id!==member.userId))} />
                <span className="wrap-anywhere">{[member.firstName,member.lastName].filter(Boolean).join(' ')||'Family member'}{member.userId===(existing?.manager?.userId??userId)?' (channel manager)':''}</span>
              </label>)}
            </fieldset>
          </fieldset>
          <FormFeedback error={error||loadError} />
          {loadError&&<Button variant="outline" onClick={()=>setRevision(v=>v+1)}>Retry members</Button>}
          <div className="flex flex-wrap justify-end gap-2"><Dialog.Close render={<Button variant="outline" disabled={busy} />}>Cancel</Dialog.Close>
            <Button type="submit" disabled={busy||!members||!!loadError}>{busy?'Saving…':existing?'Save changes':'Create channel'}</Button></div>
        </form>
      </Dialog.Popup></Dialog.Portal>
  </Dialog.Root>;
}
