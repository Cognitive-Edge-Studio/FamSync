"use client";
import type {components} from '@famsync/api-client';
import {Popover} from '@base-ui/react/popover';
import {Sticker} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {getBrowserApi} from '@/lib/browser-auth';
import {familyError} from './family-session';
import {Button} from './ui/button';
import {floatingPanel} from './ui/floating';
import {cn} from '@/lib/utils';
type State=components['schemas']['AvatarStickersDto'];
export function AvatarStickers({accessToken,familyId,channelId,onPrepared}:{accessToken:string;familyId:string;channelId:string;onPrepared:(file:{id:string;fileName:string})=>void}){
  const [open,setOpen]=useState(false),[state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<{expression:string;packId:string;id:string}|null>(null);
  useEffect(()=>{
    if(!open)return;const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){let delay=4000;try{const {data}=await getBrowserApi(accessToken).GET('/api/v1/me/avatar/stickers',{signal:abort.signal});if(!data)throw Error();if(data.pack?.status==='ready')delay=40_000;if(!abort.signal.aborted){setState(data);setError('');}}catch{if(!abort.signal.aborted)setError('Your stickers couldn’t load. Close and reopen to try again.');}if(!abort.signal.aborted)timer=setTimeout(()=>void load(),delay);}
    void load();return()=>{abort.abort();clearTimeout(timer);};
  },[open,accessToken]);
  async function create(){
    setBusy(true);setError('');
    try{const {data,error}=await getBrowserApi(accessToken).POST('/api/v1/me/avatar/stickers',{body:{id:crypto.randomUUID()}});if(!data)throw Error(familyError(error,'Sticker creation couldn’t start. Try again.'));setState(data);}
    catch(problem){setError((problem as Error).message);}finally{setBusy(false);}
  }
  async function send(expression:string){
    if(!state?.pack||busy)return;setBusy(true);setError('');
    if(request.current?.expression!==expression||request.current.packId!==state.pack.id)request.current={expression,packId:state.pack.id,id:crypto.randomUUID()};
    try{const {data,error}=await getBrowserApi(accessToken).POST('/api/v1/families/{familyId}/channels/{channelId}/stickers',{params:{path:{familyId,channelId}},body:{id:request.current!.id,packId:state.pack.id,expression:expression as components['schemas']['PrepareStickerDto']['expression']}});if(!data)throw Error(familyError(error,'Your sticker couldn’t send. Try again.'));onPrepared({id:data.id,fileName:data.fileName});request.current=null;setOpen(false);}
    catch(problem){setError((problem as Error).message);}finally{setBusy(false);}
  }
  const working=state?.pack?.status==='queued'||state?.pack?.status==='working';
  return <Popover.Root open={open} onOpenChange={next=>{if(!busy)setOpen(next);}}>
    <Popover.Trigger render={<Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Avatar stickers" title="Avatar stickers"/>}><Sticker aria-hidden="true"/></Popover.Trigger>
    <Popover.Portal><Popover.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="z-50"><Popover.Popup className={cn(floatingPanel,'grid w-80 max-w-[calc(100vw-2rem)] gap-3 p-4')}>
      <Popover.Title className="font-semibold">My avatar</Popover.Title>
      {!state&&!error&&<p role="status" className="text-sm text-muted-foreground">Loading stickers…</p>}
      {state&&!state.hasAvatar&&<><p className="text-sm text-muted-foreground">Save your own avatar first, then create stickers with six expressions.</p><a href="/account/" className="text-sm font-medium underline">Create my avatar</a></>}
      {working&&<p role="status" className="text-sm text-muted-foreground">Creating six expressions… You can close this tray and come back.</p>}
      {state?.pack?.status==='ready'&&<><p className="text-xs text-muted-foreground">Choose a sticker to send.</p><div className="grid grid-cols-3 gap-2">{state.stickers.map(sticker=><button type="button" key={sticker.expression} aria-label={'Send '+sticker.label+' avatar sticker'} title={sticker.label} disabled={busy} onClick={()=>void send(sticker.expression)} className="grid min-h-20 place-items-center rounded-xl hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"><img src={sticker.url} alt={sticker.label} width={80} height={80} className="size-20 object-contain"/></button>)}</div></>}
      {state?.hasAvatar&&!working&&state.pack?.status!=='ready'&&<><p className="text-sm text-muted-foreground">Create waving, laughing, love, thumbs-up, celebrating and surprised stickers. Your saved avatar is sent to Google Gemini.</p>{state.pack?.error&&<p role="alert" className="text-sm text-destructive">{state.pack.error}</p>}<Button type="button" disabled={busy||!state.available} onClick={()=>void create()}>{busy?'Starting…':state.pack?'Try again':'Create my stickers'}</Button>{!state.available&&<p className="text-xs text-muted-foreground">Sticker creation isn’t available right now.</p>}</>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {busy&&state?.pack?.status==='ready'&&<p role="status" className="text-xs text-muted-foreground">Sending sticker…</p>}
    </Popover.Popup></Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
