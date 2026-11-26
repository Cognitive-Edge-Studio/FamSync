"use client";
import type { components } from '@famsync/api-client';
import { useEffect, useRef, useState } from 'react';
import { getBrowserApi, getBrowserAuth } from '@/lib/browser-auth';
import { apiUploadUrl } from '@/lib/files';
import { invalidateAvatar } from '@/lib/avatars';
import { Button } from './ui/button';

type Generation=components['schemas']['AvatarGenerationDto'];
type Status=components['schemas']['AvatarStatusDto'];
async function token() {
  const {data:{session}}=await getBrowserAuth().getSession();
  if(!session)throw Error('Sign in again to change your avatar.');
  return session.access_token;
}
export function AvatarEditor({userId}:{userId:string}) {
  const [status,setStatus]=useState<Status|null>(null),[generation,setGeneration]=useState<Generation|null>(null);
  const [file,setFile]=useState<File|null>(null),[photo,setPhoto]=useState(''),[consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
  const uploadId=useRef<string|null>(null),picker=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null);
  const working=generation?.status==='queued'||generation?.status==='working';
  useEffect(()=>{
    const abort=new AbortController();
    void (async()=>{
      const api=getBrowserApi(await token());
      const {data}=await api.GET('/api/v1/me/avatar',{signal:abort.signal});
      if(!data)throw Error('Avatar settings couldn’t load. Refresh to try again.');
      if(abort.signal.aborted)return;
      setStatus(data);
      if(data.latestId){const result=await api.GET('/api/v1/me/avatar/generations/{id}',{params:{path:{id:data.latestId}},signal:abort.signal});if(!abort.signal.aborted&&result.data)setGeneration(result.data);}
    })().catch(problem=>{if(!abort.signal.aborted)setError(problem.message);});
    return ()=>abort.abort();
  },[userId]);
  useEffect(()=>{
    if(!file){setPhoto('');return;}
    const url=URL.createObjectURL(file);setPhoto(url);return ()=>URL.revokeObjectURL(url);
  },[file]);
  useEffect(()=>{
    if(!generation||!['queued','working','ready'].includes(generation.status))return;
    const id=generation.id,abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try {
        const {data}=await getBrowserApi(await token()).GET('/api/v1/me/avatar/generations/{id}',{params:{path:{id}},signal:abort.signal});
        if(!data)throw Error();
        if(!abort.signal.aborted){setGeneration(data);setError('');}
      }catch{if(!abort.signal.aborted)setError('We couldn’t check progress. Reconnecting…');}
      if(!abort.signal.aborted)timer=setTimeout(()=>void poll(),generation?.status==='ready'?40_000:3000);
    }
    timer=setTimeout(()=>void poll(),generation.status==='ready'?40_000:2000);
    return ()=>{abort.abort();clearTimeout(timer);};
  },[generation?.id,generation?.status]);
  function choose(value:File|null){
    if(!value)return;
    setError('');setNote('');
    if(!['image/jpeg','image/png','image/webp'].includes(value.type)){setError('Choose a JPEG, PNG or WebP photo.');return;}
    if(value.size>5*1024*1024){setError('Choose a photo up to 5 MB.');return;}
    setFile(value);uploadId.current=null;setGeneration(null);
  }
  async function create(fresh=false){
    if(!file||!consent)return;
    setBusy(true);setError('');setNote('');
    if(fresh)uploadId.current=null;
    uploadId.current??=crypto.randomUUID();
    try{
      const form=new FormData();form.append('id',uploadId.current);form.append('consent','true');form.append('file',file);
      const response=await fetch(apiUploadUrl('/api/v1/me/avatar/generations'),{method:'POST',headers:{Authorization:'Bearer '+await token()},body:form,signal:AbortSignal.timeout(30_000)});
      const data=await response.json();
      if(!response.ok)throw Error(typeof data.message==='string'?data.message:'We couldn’t upload this photo. Try again.');
      setGeneration(data);
    }catch(problem){setError(problem instanceof Error?problem.message:'Avatar creation failed. Try again.');}
    finally{setBusy(false);}
  }
  async function save(reset=false){
    setBusy(true);setError('');setNote('');
    try{
      const api=getBrowserApi(await token());
      const result=reset?await api.DELETE('/api/v1/me/avatar'):await api.POST('/api/v1/me/avatar/generations/{id}/accept',{params:{path:{id:generation!.id}}});
      if(!result.data)throw Error(reset?'We couldn’t reset your avatar. Try again.':'We couldn’t save this avatar. Try again.');
      invalidateAvatar(userId);setStatus(old=>old?{...old,hasAvatar:!reset}:old);setGeneration(null);setFile(null);uploadId.current=null;
      setNote(reset?'Default avatar restored.':'Your new avatar is saved.');
    }catch(problem){setError((problem as Error).message);}finally{setBusy(false);}
  }
  return <div className="mt-5 grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
    <div><h3 className="font-semibold">Create my avatar</h3><p className="mt-1 text-sm text-muted-foreground">Turn a clear photo of yourself into a FamSync character. Your current avatar stays until you choose a new one.</p></div>
    <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Choose an avatar photo" onChange={event=>{choose(event.target.files?.[0]??null);event.target.value='';}} />
    <input ref={camera} type="file" accept="image/*" capture="user" className="hidden" aria-label="Take an avatar photo" onChange={event=>{choose(event.target.files?.[0]??null);event.target.value='';}} />
    {status&&!status.available&&<p className="text-sm text-muted-foreground">Avatar creation isn’t available right now.</p>}
    {status?.available&&<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy||working} onClick={()=>camera.current?.click()}>Take photo</Button><Button type="button" variant="outline" disabled={busy||working} onClick={()=>picker.current?.click()}>Choose photo</Button></div>}
    {(photo||generation?.previewUrl)&&<div className="flex flex-wrap gap-5">{photo&&<figure><img src={photo} alt="Selected photo" className="size-28 rounded-xl object-cover"/><figcaption className="mt-1 text-xs text-muted-foreground">Your photo</figcaption></figure>}{generation?.previewUrl&&<figure><img src={generation.previewUrl} alt="Your generated FamSync avatar" className="size-28 rounded-full object-cover"/><figcaption className="mt-1 text-xs text-muted-foreground">Avatar preview</figcaption></figure>}</div>}
    {file&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy||working} className="mt-1"/><span>I agree to send this photo to Google Gemini to create my avatar. FamSync keeps uploaded photos and unused previews for up to 24 hours. Only the avatar I save is shared with people I connect with in FamSync.</span></label>}
    {working&&<p role="status" className="text-sm">Creating your avatar… You can leave this page and return to check it.</p>}
    {generation?.status==='failed'&&<p role="alert" className="text-sm text-destructive">{generation.error}</p>}
    {generation?.status==='expired'&&<p className="text-sm">This preview expired. Choose a photo to create another.</p>}
    <div className="flex flex-wrap gap-2">
      {file&&!working&&generation?.status!=='ready'&&<Button type="button" disabled={busy||!consent} onClick={()=>void create(generation?.status==='failed'||generation?.status==='expired')}>{busy?'Uploading…':'Create avatar'}</Button>}
      {generation?.status==='ready'&&<><Button type="button" disabled={busy} onClick={()=>void save()}>Use avatar</Button>{file&&<Button type="button" variant="outline" disabled={busy||!consent} onClick={()=>void create(true)}>Try again</Button>}</>}
      {status?.hasAvatar&&<Button type="button" variant="ghost" disabled={busy||working} onClick={()=>void save(true)}>Reset avatar</Button>}
    </div>
    {status?.available&&<p className="text-xs text-muted-foreground">Up to {status.dailyLimit} creations per day. JPEG, PNG or WebP, up to 5 MB.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{note&&<p role="status" className="text-sm">{note}</p>}
  </div>;
}
