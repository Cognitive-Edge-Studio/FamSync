"use client";
import type {components} from '@famsync/api-client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {getBrowserApi} from '@/lib/browser-auth';
import {Field,FormFeedback,inputClass} from './account-fields';
import {familyError} from './family-session';
import {Button} from './ui/button';
type Entry=components['schemas']['GuestEntryDto'];
type Policy=components['schemas']['GuestPolicyDto'];
export function GuestAccessPanel({familyId,accessToken,channelId,owner=false}:{familyId:string;accessToken:string;channelId?:string;owner?:boolean}){
 const [policy,setPolicy]=useState<Policy>(),[entries,setEntries]=useState<Entry[]>([]),[pages,setPages]=useState(1),[next,setNext]=useState<string|null>(null);
 const [email,setEmail]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[note,setNote]=useState('');
 const draft=useRef('');
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')setRevision(v=>v+1);},15000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const c=new AbortController();setLoading(true);async function load(){try{
  const api=getBrowserApi(accessToken),p=await api.GET('/api/v1/families/{familyId}/guest-policy',{params:{path:{familyId}},signal:c.signal});if(!p.data)throw Error();
  let cursor:string|undefined,last:string|null=null;const items:Entry[]=[];
  for(let n=0;n<pages;n++){const r=await api.GET('/api/v1/families/{familyId}/guest-access',{params:{path:{familyId},query:{channelId,cursor,limit:20}},signal:c.signal});if(!r.data)throw Error();items.push(...r.data.entries);last=r.data.nextCursor;if(!last)break;cursor=last;}
  if(!c.signal.aborted){setPolicy(p.data);setEntries(items);setNext(last);}
 }catch{if(!c.signal.aborted){setEntries([]);setError('We couldn’t refresh guest access. Reload and try again.');}}finally{if(!c.signal.aborted)setLoading(false);}}void load();return()=>c.abort();},[accessToken,familyId,channelId,revision,pages]);
 async function changePolicy(){if(!policy)return;setBusy(true);setError('');setNote('');try{const r=await getBrowserApi(accessToken).PUT('/api/v1/families/{familyId}/guest-policy',{params:{path:{familyId}},body:{allowed:!policy.allowed,version:policy.version}});if(!r.data){setError(familyError(r.error,'We couldn’t save the guest policy.'));return;}setPolicy(r.data);setNote(r.data.allowed?'Channel guests enabled. Managers can send invitations.':'Channel guests disabled. Current grants and pending invitations were revoked.');setRevision(v=>v+1);}catch{setError('We couldn’t save the guest policy. Try again.');}finally{setBusy(false);}}
 async function invite(e:FormEvent){e.preventDefault();if(!channelId||busy)return;draft.current||=crypto.randomUUID();setBusy(true);setError('');setNote('');try{const r=await getBrowserApi(accessToken).POST('/api/v1/families/{familyId}/channels/{channelId}/guest-invitations',{params:{path:{familyId,channelId}},body:{id:draft.current,email:email.trim()}});if(!r.data){setError(familyError(r.error,'We couldn’t save the guest invitation.'));return;}draft.current='';setEmail('');setNote('Invitation saved. Email delivery will appear in the list.');setRevision(v=>v+1);}catch{setError('We couldn’t save the invitation. Your email entry is kept.');}finally{setBusy(false);}}
 async function action(entry:Entry,resend=false){setBusy(true);setError('');setNote('');try{
  const api=getBrowserApi(accessToken),path={familyId,channelId:entry.channelId,invitationId:entry.id};
  const r=resend?await api.POST('/api/v1/families/{familyId}/channels/{channelId}/guest-invitations/{invitationId}/resend',{params:{path}}):entry.kind==='invitation'?await api.DELETE('/api/v1/families/{familyId}/channels/{channelId}/guest-invitations/{invitationId}',{params:{path}}):await api.DELETE('/api/v1/families/{familyId}/channels/{channelId}/guests/{userId}',{params:{path:{familyId,channelId:entry.channelId,userId:entry.id}}});
  if(!r.data){setError(familyError(r.error,'We couldn’t update this guest access.'));return;}setNote(resend?'New invitation queued. The earlier link is no longer valid.':'Guest access revoked.');setRevision(v=>v+1);
 }catch{setError('We couldn’t update this guest access. Try again.');}finally{setBusy(false);}}
 return <section className="grid gap-4 rounded-2xl border border-border bg-panel p-5" aria-label="Guest access management">
  <div><h2 className="text-xl font-semibold">Channel guests</h2><p className="mt-2 text-sm text-muted-foreground">Guests can participate only in their granted channels. Family work and the member directory stay restricted.</p></div>
  {policy&&<p className="text-sm font-semibold">Guest invitations {policy.allowed?'enabled':'disabled'}</p>}
  {owner&&policy&&<div className="grid justify-items-start gap-3"><p className="text-sm text-muted-foreground">Disabling guests immediately revokes all current guest access and pending channel invitations. Enabling again requires new invitations.</p><Button variant="outline" disabled={busy||loading} onClick={()=>void changePolicy()}>{policy.allowed?'Disable and revoke all guests':'Enable channel guests'}</Button></div>}
  {channelId&&<form className="flex flex-wrap items-end gap-3" onSubmit={e=>void invite(e)}><div className="min-w-0 grow"><Field id="guest-invite-email" label="Guest email"><input id="guest-invite-email" type="email" className={inputClass} required maxLength={254} value={email} disabled={busy||!policy?.allowed} onChange={e=>{setEmail(e.target.value);draft.current='';}} /></Field></div><Button type="submit" disabled={busy||!policy?.allowed||!email.trim()}>Invite guest</Button></form>}
  {channelId&&policy&&!policy.allowed&&<p className="text-sm text-muted-foreground">Ask the family owner to enable channel guests from family settings.</p>}
  <FormFeedback error={error} note={note|| (loading?'Refreshing guest access…':undefined)} />
  <Button className="justify-self-start" variant="ghost" disabled={busy} onClick={()=>{setError('');setRevision(v=>v+1);}}>Reload guest access</Button>
  {!loading&&!entries.length&&!error&&<p className="text-sm text-muted-foreground">No guest invitations or grants yet.</p>}
  <ul aria-label="Guest invitations and grants" className="grid gap-3">{entries.map(e=><li className="grid min-w-0 gap-2 rounded-xl border border-border p-3" key={e.kind+e.channelId+e.id}>
   <p className="wrap-anywhere font-semibold">{e.email}</p><p className="wrap-anywhere text-sm text-muted-foreground">{e.channelName} · {e.kind==='grant'?'Guest access':'Invitation'} · {e.status}{e.deliveryStatus?' · Email '+e.deliveryStatus:''}{e.expiresAt?' · Expires '+new Date(e.expiresAt).toLocaleDateString():''}</p>
   {e.deliveryStatus==='failed'&&e.status!=='revoked'&&<p className="text-sm text-destructive">Email delivery failed. The manager can resend to retry.</p>}
   <div className="flex flex-wrap gap-2">{channelId&&e.kind==='invitation'&&['pending','expired'].includes(e.status)&&<Button variant="outline" disabled={busy||!policy?.allowed} onClick={()=>void action(e,true)}>Resend invitation to {e.email}</Button>}
    {((e.kind==='grant'&&e.status==='active')||(e.kind==='invitation'&&['pending','expired'].includes(e.status)))&&<Button variant="outline" disabled={busy} onClick={()=>void action(e)}>Revoke {e.kind==='grant'?'guest':'invitation'} {e.email}</Button>}</div>
  </li>)}</ul>
  {next&&<Button variant="outline" disabled={busy||loading} onClick={()=>setPages(v=>v+1)}>More guest access</Button>}
 </section>;
}
