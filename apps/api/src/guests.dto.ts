import {ApiProperty} from '@nestjs/swagger';
import {z} from 'zod';
import {inviteInput} from './family.dto.js';
export const guestInviteInput=inviteInput.extend({id:z.uuid()});
export const guestPolicyInput=z.strictObject({allowed:z.boolean(),version:z.int().positive()});
export const guestPageInput=z.strictObject({channelId:z.uuid().optional(),cursor:z.string().max(500).optional(),limit:z.coerce.number().int().min(1).max(100).optional()});
export const guestWorkspaceInput=z.strictObject({cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).optional()});
export class GuestInviteInputDto{@ApiProperty() id!:string;@ApiProperty() email!:string;}
export class GuestPolicyDto{@ApiProperty() allowed!:boolean;@ApiProperty() version!:number;}
export class GuestEntryDto{
 @ApiProperty() id!:string;
 @ApiProperty({enum:['invitation','grant']}) kind!:'invitation'|'grant';
 @ApiProperty() channelId!:string;
 @ApiProperty() channelName!:string;
 @ApiProperty() email!:string;
 @ApiProperty({enum:['pending','accepted','expired','revoked','active']}) status!:'pending'|'accepted'|'expired'|'revoked'|'active';
 @ApiProperty({type:String,nullable:true,enum:['pending','sent','failed']}) deliveryStatus!:'pending'|'sent'|'failed'|null;
 @ApiProperty({type:String,nullable:true}) expiresAt!:string|null;
 @ApiProperty() createdAt!:string;
}
export class GuestEntryPageDto{@ApiProperty({type:[GuestEntryDto]}) entries!:GuestEntryDto[];@ApiProperty({type:String,nullable:true}) nextCursor!:string|null;}
export class GuestAcceptanceDto{@ApiProperty() familyId!:string;@ApiProperty() channelId!:string;}
export class GuestWorkspaceDto{
 @ApiProperty() id!:string;@ApiProperty() familyId!:string;@ApiProperty() familyName!:string;
 @ApiProperty() name!:string;@ApiProperty() emoji!:string;@ApiProperty() archived!:boolean;@ApiProperty() unread!:number;
}
export class GuestWorkspacePageDto{@ApiProperty({type:[GuestWorkspaceDto]}) channels!:GuestWorkspaceDto[];@ApiProperty({type:String,nullable:true}) nextCursor!:string|null;}
