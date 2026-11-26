import type { components } from '@famsync/api-client';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Switch, View } from 'react-native';
import { getApi, required } from '@/lib/api';
import { choosePhotos, takePhoto, uploadFile, type Picked } from '@/lib/attachments';
import { invalidateAvatar } from '@/lib/avatars';
import { useSignedIn } from '@/lib/session';
import { Button, Card, Text } from './ui';

type Generation=components['schemas']['AvatarGenerationDto'];
type Status=components['schemas']['AvatarStatusDto'];
export function AvatarEditor() {
  const {access_token,user}=useSignedIn();
  const [status,setStatus]=useState<Status|null>(null),[generation,setGeneration]=useState<Generation|null>(null),[file,setFile]=useState<Picked|null>(null);
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[percent,setPercent]=useState(0);
  const uploadId=useRef<string|null>(null),upload=useRef<AbortController|null>(null);
  const working=generation?.status==='queued'||generation?.status==='working';
  useEffect(()=>{
    const abort=new AbortController();
    void (async()=>{
      const api=getApi(access_token),data=required(await api.GET('/api/v1/me/avatar',{signal:abort.signal}));
      if(abort.signal.aborted)return;setStatus(data);
      if(data.latestId){const result=required(await api.GET('/api/v1/me/avatar/generations/{id}',{params:{path:{id:data.latestId}},signal:abort.signal}));if(!abort.signal.aborted)setGeneration(result);}
    })().catch(()=>{if(!abort.signal.aborted)setError('Avatar settings couldn’t load. Reopen this page to try again.');});
    return ()=>abort.abort();
  },[access_token]);
  useEffect(()=>()=>upload.current?.abort(),[]);
  useEffect(()=>{
    if(!generation||!['queued','working','ready'].includes(generation.status))return;
    const id=generation.id,abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function poll(){
      try{
        const data=required(await getApi(access_token).GET('/api/v1/me/avatar/generations/{id}',{params:{path:{id}},signal:abort.signal}));
        if(!abort.signal.aborted){setGeneration(data);setError('');}
      }catch{if(!abort.signal.aborted)setError('We couldn’t check progress. Reconnecting…');}
      if(!abort.signal.aborted)timer=setTimeout(()=>void poll(),generation?.status==='ready'?40_000:3000);
    }
    timer=setTimeout(()=>void poll(),generation.status==='ready'?40_000:2000);
    return ()=>{abort.abort();clearTimeout(timer);};
  },[access_token,generation?.id,generation?.status]);
  async function pick(camera=false){
    setError('');setNote('');
    try{const picked=(await(camera?takePhoto():choosePhotos(1)))[0];if(picked){setFile(picked);setGeneration(null);uploadId.current=null;}}
    catch(problem){setError((problem as Error).message);}
  }
  async function create(fresh=false){
    if(!file||!consent)return;
    setBusy(true);setPercent(0);setError('');setNote('');
    if(fresh)uploadId.current=null;uploadId.current??=randomUUID();
    const abort=new AbortController();upload.current=abort;
    try{
      const result=await uploadFile<Generation>({path:'/api/v1/me/avatar/generations',fields:{id:uploadId.current,consent:'true'},file,token:access_token,signal:abort.signal,onProgress:setPercent});
      if(!abort.signal.aborted)setGeneration(result);
    }catch(problem){if(!abort.signal.aborted)setError((problem as Error).message);}
    finally{if(!abort.signal.aborted)setBusy(false);}
  }
  async function save(reset=false){
    setBusy(true);setError('');setNote('');
    try{
      const api=getApi(access_token);
      required(reset?await api.DELETE('/api/v1/me/avatar'):await api.POST('/api/v1/me/avatar/generations/{id}/accept',{params:{path:{id:generation!.id}}}));
      invalidateAvatar(user.id);setStatus(old=>old?{...old,hasAvatar:!reset}:old);setGeneration(null);setFile(null);uploadId.current=null;
      setNote(reset?'Default avatar restored.':'Your new avatar is saved.');
    }catch{setError(reset?'We couldn’t reset your avatar. Try again.':'We couldn’t save this avatar. Try again.');}
    finally{setBusy(false);}
  }
  return <Card>
    <Text size={17} weight="600" accessibilityRole="header">Create my avatar</Text>
    <Text muted size={13}>Turn a clear photo of yourself into a FamSync character. Your current avatar stays until you choose a new one.</Text>
    {status&&!status.available&&<Text muted>Avatar creation isn’t available right now.</Text>}
    {status?.available&&<View style={{gap:8}}>{Platform.OS!=='web'&&<Button title="Take photo" variant="outline" icon="camera-outline" disabled={busy||working} onPress={()=>void pick(true)}/>}<Button title="Choose photo" variant="outline" icon="image-outline" disabled={busy||working} onPress={()=>void pick()}/></View>}
    {(file||generation?.previewUrl)&&<View style={{flexDirection:'row',gap:18,flexWrap:'wrap'}}>{file&&<View style={{gap:4}}><Image source={{uri:file.uri}} accessibilityLabel="Selected photo" style={{width:110,height:110,borderRadius:14}}/><Text muted size={12}>Your photo</Text></View>}{generation?.previewUrl&&<View style={{gap:4}}><Image source={{uri:generation.previewUrl}} accessibilityLabel="Your generated FamSync avatar" style={{width:110,height:110,borderRadius:55}}/><Text muted size={12}>Avatar preview</Text></View>}</View>}
    {file&&<View style={{gap:8}}><Text size={13}>I agree to send this photo to Google Gemini to create my avatar. FamSync keeps uploaded photos and unused previews for up to 24 hours. Only the avatar I save is shared with people I connect with in FamSync.</Text><Switch accessibilityLabel="Agree to send photo for avatar creation" value={consent} onValueChange={setConsent} disabled={busy||working}/></View>}
    {working&&<Text accessibilityLiveRegion="polite">Creating your avatar… You can leave this page and return to check it.</Text>}
    {generation?.status==='failed'&&<Text accessibilityRole="alert">{generation.error}</Text>}
    {generation?.status==='expired'&&<Text>This preview expired. Choose a photo to create another.</Text>}
    {file&&!working&&generation?.status!=='ready'&&<Button title={busy?'Uploading '+percent+'%':'Create avatar'} busy={busy} disabled={!consent} onPress={()=>void create(generation?.status==='failed'||generation?.status==='expired')}/>}
    {generation?.status==='ready'&&<><Button title="Use avatar" busy={busy} onPress={()=>void save()}/>{file&&<Button title="Try again" variant="outline" disabled={busy||!consent} onPress={()=>void create(true)}/>}</>}
    {status?.hasAvatar&&<Button title="Reset avatar" variant="ghost" disabled={busy||working} onPress={()=>void save(true)}/>}
    {status?.available&&<Text muted size={12}>Up to {status.dailyLimit} creations per day. JPEG, PNG or WebP, up to 5 MB.</Text>}
    {!!error&&<Text accessibilityRole="alert">{error}</Text>}{!!note&&<Text accessibilityLiveRegion="polite">{note}</Text>}
  </Card>;
}
