import type { components } from '@famsync/api-client';
export type Channel=components['schemas']['ChannelDto'];
export type ChannelDetail=components['schemas']['ChannelDetailDto'];
export type ChannelMessage=components['schemas']['ChannelMessageDto'];
export const channelReactions=['👍','❤️','🎉','😂','🙏'] as const;
export function channelPath(family:string,id:string,kind:Channel['kind']='channel') {return (kind==='dm'?'/direct/?':'/channel/?')+new URLSearchParams({family,id});}
export function chatMessagePath(family:string,conversation:string,message:string,kind:Channel['kind']|'guest'){
  return (kind==='guest'?'/guest-channel/?':kind==='dm'?'/direct/?':'/channel/?')+new URLSearchParams({family,id:conversation,message});
}
export {attachmentLabel} from '@famsync/core/chat';
