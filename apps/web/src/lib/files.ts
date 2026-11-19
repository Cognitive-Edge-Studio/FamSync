import type {components} from '@famsync/api-client';
export type Folder=components['schemas']['FolderDto'];
export type StoredFile=components['schemas']['StoredFileDto'];
export const folderPath=(family:string,id:string,guest=false)=>'/folder/?'+new URLSearchParams({family,id,...(guest?{guest:'1'}:{})});
export const foldersPath=(family:string,channel?:string,guest=false)=>'/folders/?'+new URLSearchParams({family,...(channel?{channel}:{}),...(guest?{guest:'1'}:{})});
export const fileSize=(size:number)=>size<1024?size+' B':size<1048576?(size/1024).toFixed(1)+' KB':(size/1048576).toFixed(1)+' MB';
export function apiUploadUrl(path:string){const base=process.env.NEXT_PUBLIC_API_BASE_URL;if(!base)throw Error('Uploads are unavailable.');return base.replace(/\/$/,'')+path;}
