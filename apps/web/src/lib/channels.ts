import type { components } from '@famsync/api-client';
export type Channel=components['schemas']['ChannelDto'];
export type ChannelDetail=components['schemas']['ChannelDetailDto'];
export type ChannelMessage=components['schemas']['ChannelMessageDto'];
export const channelReactions=['👍','❤️','🎉','😂','🙏'] as const;
export function channelPath(family:string,id:string,kind:Channel['kind']='channel') {return (kind==='dm'?'/direct/?':'/channel/?')+new URLSearchParams({family,id});}
export function messagePath(family:string,conversation:string,id:string){return '/message/?'+new URLSearchParams({family,conversation,id});}
