import type {components} from '@famsync/api-client';
import {randomUUID} from 'expo-crypto';
import {router} from 'expo-router';
import {useEffect,useRef,useState} from 'react';
import {Image,Modal,Pressable,ScrollView,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getApi,required} from '@/lib/api';
import {useSignedIn} from '@/lib/session';
import {useTheme} from '@/lib/theme';
import {Button,Icon,Text} from './ui';
type State=components['schemas']['AvatarStickersDto'];
export function AvatarStickers({familyId,channelId,onPrepared}:{familyId:string;channelId:string;onPrepared:(file:{id:string;fileName:string})=>void}){
  const {access_token}=useSignedIn(),{colors}=useTheme(),insets=useSafeAreaInsets();
  const [open,setOpen]=useState(false),[state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<{expression:string;packId:string;id:string}|null>(null);
  useEffect(()=>{
    if(!open)return;const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function load(){let delay=4000;try{const data=required(await getApi(access_token).GET('/api/v1/me/avatar/stickers',{signal:abort.signal}));if(data.pack?.status==='ready')delay=40_000;if(!abort.signal.aborted){setState(data);setError('');}}catch{if(!abort.signal.aborted)setError('Your stickers couldn’t load. Close and reopen to try again.');}if(!abort.signal.aborted)timer=setTimeout(()=>void load(),delay);}
    void load();return()=>{abort.abort();clearTimeout(timer);};
  },[open,access_token]);
  async function create(){setBusy(true);setError('');
    try{const result=await getApi(access_token).POST('/api/v1/me/avatar/stickers',{body:{id:randomUUID()}});if(!result.data)throw Error((result.error as {message?:string}|undefined)?.message??'Sticker creation couldn’t start. Try again.');setState(result.data);}
    catch(problem){setError((problem as Error).message);}finally{setBusy(false);}
  }
  async function send(expression:components['schemas']['AvatarStickerDto']['expression']){
    if(!state?.pack||busy)return;setBusy(true);setError('');if(request.current?.expression!==expression||request.current.packId!==state.pack.id)request.current={expression,packId:state.pack.id,id:randomUUID()};
    try{const result=await getApi(access_token).POST('/api/v1/families/{familyId}/channels/{channelId}/stickers',{params:{path:{familyId,channelId}},body:{id:request.current!.id,packId:state.pack.id,expression}});if(!result.data)throw Error((result.error as {message?:string}|undefined)?.message??'Your sticker couldn’t send. Try again.');onPrepared({id:result.data.id,fileName:result.data.fileName});request.current=null;setOpen(false);}
    catch(problem){setError((problem as Error).message);}finally{setBusy(false);}
  }
  const working=state?.pack?.status==='queued'||state?.pack?.status==='working';
  return <><Pressable accessibilityRole="button" accessibilityLabel="Avatar stickers" onPress={()=>setOpen(true)} style={{width:44,height:48,alignItems:'center',justifyContent:'center'}}><Icon name="happy-outline" size={25} color={colors.primary}/></Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={()=>{if(!busy)setOpen(false);}}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#00000055'}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close avatar stickers" disabled={busy} onPress={()=>setOpen(false)} style={{flex:1}}/>
      <View accessibilityViewIsModal style={{backgroundColor:colors.panel,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:Math.max(insets.bottom,20),gap:14,maxHeight:'80%'}}>
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text size={18} weight="600" accessibilityRole="header">My avatar</Text><Button variant="ghost" title="Close" disabled={busy} onPress={()=>setOpen(false)}/></View>
        <ScrollView contentContainerStyle={{gap:14}}>
          {!state&&!error&&<Text muted accessibilityLiveRegion="polite">Loading stickers…</Text>}
          {state&&!state.hasAvatar&&<><Text muted>Save your own avatar first, then create stickers with six expressions.</Text><Button title="Create my avatar" onPress={()=>{setOpen(false);router.push('/account');}}/></>}
          {working&&<Text muted accessibilityLiveRegion="polite">Creating six expressions… You can close this tray and come back.</Text>}
          {state?.pack?.status==='ready'&&<><Text muted size={13}>Choose a sticker to send.</Text><View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center'}}>{state.stickers.map(sticker=><Pressable key={sticker.expression} accessibilityRole="button" accessibilityLabel={'Send '+sticker.label+' avatar sticker'} disabled={busy} onPress={()=>void send(sticker.expression)} style={({pressed})=>({width:'33.33%',height:104,alignItems:'center',justifyContent:'center',borderRadius:16,backgroundColor:pressed?colors.accent:'transparent',opacity:busy?0.5:1})}><Image source={{uri:sticker.url}} accessibilityLabel={sticker.label} style={{width:92,height:92}} resizeMode="contain"/></Pressable>)}</View></>}
          {state?.hasAvatar&&!working&&state.pack?.status!=='ready'&&<><Text muted>Create waving, laughing, love, thumbs-up, celebrating and surprised stickers. Your saved avatar is sent to Google Gemini.</Text>{state.pack?.error&&<Text accessibilityRole="alert">{state.pack.error}</Text>}<Button title={state.pack?'Try again':'Create my stickers'} busy={busy} disabled={!state.available} onPress={()=>void create()}/>{!state.available&&<Text muted size={13}>Sticker creation isn’t available right now.</Text>}</>}
          {!!error&&<Text accessibilityRole="alert">{error}</Text>}{busy&&state?.pack?.status==='ready'&&<Text muted accessibilityLiveRegion="polite">Sending sticker…</Text>}
        </ScrollView>
      </View>
    </View></Modal>
  </>;
}
