import {ApiProperty,ApiPropertyOptional} from '@nestjs/swagger';
import {z} from 'zod';
import {itemAudiences} from './calendar.dto.js';
const name=z.string().trim().min(1).max(100).refine(v=>!/[\x00-\x1f\x7f]/.test(v));
export const folderCreateInput=z.strictObject({id:z.uuid(),name,channelId:z.uuid().nullable().optional(),channelVersion:z.int().positive().nullable().optional(),audience:z.enum(itemAudiences),selectedMemberIds:z.array(z.uuid()).max(100)});
export const folderEditInput=z.strictObject({version:z.int().positive(),name,audience:z.enum(itemAudiences),selectedMemberIds:z.array(z.uuid()).max(100)});
export const fileArchiveInput=z.strictObject({version:z.int().positive(),archived:z.boolean()});
export const fileUploadInput=z.strictObject({id:z.uuid(),version:z.coerce.number().int().positive()});
export const folderListInput=z.strictObject({channelId:z.uuid().optional(),kind:z.enum(['family','channel','all']).optional(),q:z.string().trim().max(120).optional(),archived:z.enum(['true','false']).optional(),cursor:z.string().max(1600).optional(),limit:z.coerce.number().int().min(1).max(100).optional()});
export const fileListInput=z.strictObject({folderId:z.uuid().optional(),channelId:z.uuid().optional(),q:z.string().trim().max(120).optional(),archived:z.enum(['true','false']).optional(),type:z.enum(['all','image','document']).optional(),sort:z.enum(['name','name-desc','recent','oldest']).optional(),cursor:z.string().max(1600).optional(),limit:z.coerce.number().int().min(1).max(100).optional()}).refine(v=>!!v.folderId!==!!v.channelId);
export class FolderFieldsDto{@ApiProperty() name!:string;@ApiProperty({enum:itemAudiences}) audience!:'family'|'selected'|'private';@ApiProperty({type:[String]}) selectedMemberIds!:string[];}
export class CreateFolderDto extends FolderFieldsDto{@ApiProperty() id!:string;@ApiPropertyOptional({type:String,nullable:true}) channelId?:string|null;@ApiPropertyOptional({type:Number,nullable:true}) channelVersion?:number|null;}
export class EditFolderDto extends FolderFieldsDto{@ApiProperty() version!:number;}
export class FileArchiveDto{@ApiProperty() version!:number;@ApiProperty() archived!:boolean;}
export class FolderDto extends FolderFieldsDto{
 @ApiProperty() id!:string;@ApiProperty() familyId!:string;@ApiProperty({type:String,nullable:true}) channelId!:string|null;
 @ApiProperty({type:String,nullable:true}) channelName!:string|null;@ApiProperty() version!:number;@ApiProperty() archived!:boolean;
 @ApiProperty() canManage!:boolean;@ApiProperty() canUpload!:boolean;@ApiProperty() fileCount!:number;@ApiProperty() createdAt!:string;
}
export class FolderPageDto{@ApiProperty({type:[FolderDto]}) folders!:FolderDto[];@ApiProperty({type:String,nullable:true}) nextCursor!:string|null;@ApiProperty() canCreate!:boolean;@ApiProperty({type:Number,nullable:true}) channelVersion!:number|null;@ApiProperty({type:String,nullable:true}) channelName!:string|null;}
export class StoredFileDto{
 @ApiProperty() id!:string;@ApiProperty({type:String,nullable:true}) folderId!:string|null;@ApiProperty() fileName!:string;@ApiProperty() mime!:string;@ApiProperty() byteSize!:number;
 @ApiProperty() version!:number;@ApiProperty() archived!:boolean;@ApiProperty() createdAt!:string;@ApiProperty() canManage!:boolean;@ApiProperty() canDownload!:boolean;
 @ApiProperty({enum:['image','text','audio','video','none']}) preview!:'image'|'text'|'audio'|'video'|'none';
 @ApiProperty({type:Number,nullable:true}) voiceSeconds!:number|null;
}
export class FilePageDto{@ApiProperty({type:[StoredFileDto]}) files!:StoredFileDto[];@ApiProperty({type:String,nullable:true}) nextCursor!:string|null;}
export const chatUploadInput=z.object({id:z.uuid(),voiceSeconds:z.coerce.number().int().min(1).max(3600).optional()});
export class FileUploadDto{@ApiProperty() id!:string;@ApiProperty() version!:number;@ApiProperty({type:'string',format:'binary'}) file!:string;}
export class FileGrantDto{@ApiProperty() url!:string;@ApiProperty() expiresAt!:string;@ApiProperty() fileName!:string;}
export class FilePreviewDto{@ApiProperty({enum:['image','text','audio','video']}) kind!:'image'|'text'|'audio'|'video';@ApiProperty() fileName!:string;@ApiProperty({type:String,nullable:true}) url!:string|null;@ApiProperty({type:String,nullable:true}) text!:string|null;@ApiProperty({type:String,nullable:true}) expiresAt!:string|null;}
export class FileMutationDto{@ApiProperty() id!:string;}
export class FileVersionDto{@ApiProperty() version!:number;}
