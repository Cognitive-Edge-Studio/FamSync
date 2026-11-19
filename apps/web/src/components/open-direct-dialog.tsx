"use client";
import {Dialog} from '@base-ui/react/dialog';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {components} from '@famsync/api-client';
import {getBrowserApi} from '@/lib/browser-auth';
import {channelPath} from '@/lib/channels';
import {Field,FormFeedback,inputClass} from './account-fields';
import {familyError} from './family-session';
import {Button} from './ui/button';
export function OpenDirectDialog({familyId,accessToken,userId,onClose}:{familyId:string;accessToken:string;userId:string;onClose:()=>void}){
 const [members,setMembers]=useState<components['schemas']['FamilyMemberDto'][]>(),[peer,setPeer]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const focus=useRef<HTMLSelectElement>(null);
 useEffect(()=>{const c=new AbortController();setError('');void getBrowserApi(accessToken).GET('/api/v1/families/{familyId}/members',{params:{path:{familyId}},signal:c.signal})
  .then(({data})=>{if(c.signal.aborted)return;if(data)setMembers(data.filter(m=>m.userId!==userId));else setError('We couldn’t load current family members.');})
  .catch(()=>{if(!c.signal.aborted)setError('We couldn’t load current family members.');});return()=>c.abort();},[familyId,accessToken,userId,revision]);
 async function submit(e:FormEvent){e.preventDefault();if(busy||!peer)return;setBusy(true);setError('');try{
  const {data,error}=await getBrowserApi(accessToken).POST('/api/v1/families/{familyId}/channels/direct',{params:{path:{familyId}},body:{peerId:peer}});
  if(data)window.location.assign(channelPath(familyId,data.id,'dm'));else setError(familyError(error,'We couldn’t open the conversation. Try again.'));
 }catch{setError('We couldn’t open the conversation. Try again.');}finally{setBusy(false);}}
 return <Dialog.Root open disablePointerDismissal onOpenChange={v=>{if(!v&&!busy)onClose();}}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
  <Dialog.Popup initialFocus={focus} className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-1/2 rounded-2xl border border-border bg-panel p-5 shadow-xl">
   <Dialog.Title className="text-xl font-semibold">New direct message</Dialog.Title><Dialog.Description className="mt-2 text-sm text-muted-foreground">A private conversation for you and one current family member.</Dialog.Description>
   <form className="mt-5 grid gap-4" onSubmit={e=>void submit(e)}><Field id="direct-peer" label="Family member"><select ref={focus} id="direct-peer" className={inputClass} value={peer} required disabled={busy||!members} onChange={e=>setPeer(e.target.value)}>
    <option value="">Choose a person</option>{members?.map(m=><option key={m.userId} value={m.userId}>{[m.firstName,m.lastName].filter(Boolean).join(' ')||'Family member'}</option>)}
   </select></Field>{members?.length===0&&<p className="text-sm text-muted-foreground">Invite another family member before starting a direct message.</p>}
   <FormFeedback error={error} note={!members&&!error?'Loading family members…':undefined} />
   {!members&&error&&<Button variant="outline" onClick={()=>setRevision(v=>v+1)}>Retry members</Button>}
   <div className="flex justify-end gap-2"><Dialog.Close render={<Button variant="outline" disabled={busy} />}>Cancel</Dialog.Close><Button type="submit" disabled={busy||!peer}>{busy?'Opening…':'Open conversation'}</Button></div></form>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
