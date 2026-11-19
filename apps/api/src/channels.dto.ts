import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { z } from "zod";
import { TaskPersonDto } from "./tasks.dto.js";
import { CreateTaskDto, createTaskInput } from './tasks.dto.js';

const text = (max: number) => z.string().trim().max(max).refine((value) => !value.includes('\0'));
const fields = { name: text(80).pipe(z.string().min(1)), emoji: text(16).pipe(z.string().min(1)),
  topic: text(200), description: text(2000), memberIds: z.array(z.uuid()).min(1).max(100) };
export const createChannelInput = z.strictObject({ id: z.uuid(), ...fields });
export const updateChannelInput = z.strictObject({ version: z.int().positive(), ...fields });
export const archiveChannelInput = z.strictObject({ version: z.int().positive(), archived: z.boolean() });
export const channelListInput = z.strictObject({ q: text(120).optional(), archived: z.enum(['true','false']).optional(),
  kind:z.enum(['channel','dm']).optional(), cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });
export const channelMessageInput = z.strictObject({ id: z.uuid(), body: text(4000).pipe(z.string().min(1)), replyToId: z.uuid().nullable().optional(),mentionedUserIds:z.array(z.uuid()).max(100).optional(),fileIds:z.array(z.uuid()).max(5).optional() });
export const directInput=z.strictObject({peerId:z.uuid()});
export const muteInput=z.strictObject({muted:z.boolean()});
export const messageSearchInput=z.strictObject({q:text(120).pipe(z.string().min(1)),conversationId:z.uuid().optional(),cursor:z.string().max(500).optional(),limit:z.coerce.number().int().min(1).max(100).optional()});
export const messageTaskInput=createTaskInput.extend({audience:z.enum(['private','selected']),conversationVersion:z.int().positive()});
export const messageEventInput=z.strictObject({id:z.uuid(),eventId:z.uuid(),version:z.int().positive()});
export const eventCandidatesInput=z.strictObject({q:text(120).optional(),cursor:z.string().max(500).optional(),limit:z.coerce.number().int().min(1).max(100).optional()});
export const workSourceInput=z.strictObject({kind:z.enum(['task','event']),id:z.uuid()});
export const unlinkSourceInput=z.strictObject({version:z.int().positive()});
export const channelHistoryInput = z.strictObject({ before: z.coerce.number().int().positive().max(2147483647).optional(),
  after: z.coerce.number().int().nonnegative().max(2147483647).optional(), limit: z.coerce.number().int().min(1).max(100).optional() })
  .refine((value) => value.before === undefined || value.after === undefined);
export const channelReadInput = z.strictObject({ position: z.int().nonnegative().max(2147483647) });
export const reactionEmojis = ['👍','❤️','🎉','😂','🙏'] as const;
export const channelReactionInput = z.strictObject({ emoji: z.enum(reactionEmojis), active: z.boolean() });
export type CreateChannelInput = z.infer<typeof createChannelInput>;
export type UpdateChannelInput = z.infer<typeof updateChannelInput>;
export type ChannelListInput = z.infer<typeof channelListInput>;
export type ChannelHistoryInput = z.infer<typeof channelHistoryInput>;
export type ChannelMessageInput = z.infer<typeof channelMessageInput>;

class ChannelFieldsDto {
  @ApiProperty({ maxLength: 80 }) name!: string;
  @ApiProperty({ maxLength: 16 }) emoji!: string;
  @ApiProperty({ maxLength: 200 }) topic!: string;
  @ApiProperty({ maxLength: 2000 }) description!: string;
  @ApiProperty({ type: [String], maxItems: 100 }) memberIds!: string[];
}
export class CreateChannelDto extends ChannelFieldsDto { @ApiProperty({ format: 'uuid' }) id!: string; }
export class UpdateChannelDto extends ChannelFieldsDto { @ApiProperty() version!: number; }
export class ArchiveChannelDto { @ApiProperty() version!: number; @ApiProperty() archived!: boolean; }
export class ChannelDto {
  @ApiProperty({type:String,nullable:true}) imageFileId!:string|null;
  @ApiProperty() canCreateWork!:boolean;
  @ApiProperty({enum:['channel','dm']}) kind!: 'channel'|'dm';
  @ApiProperty() muted!: boolean;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() emoji!: string;
  @ApiProperty() topic!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: TaskPersonDto, nullable: true }) manager!: TaskPersonDto | null;
  @ApiProperty() canManage!: boolean;
  @ApiProperty() memberCount!: number;
  @ApiProperty() unread!: number;
  @ApiProperty() lastPosition!: number;
  @ApiProperty() readPosition!: number;
  @ApiProperty() archived!: boolean;
  @ApiProperty() version!: number;
}
export class ChannelPersonDto extends TaskPersonDto {@ApiProperty() guest!:boolean;}
export class ChannelDetailDto extends ChannelDto { @ApiProperty({ type: [ChannelPersonDto] }) members!: ChannelPersonDto[]; }
export class ChannelPageDto {
  @ApiProperty({ type: [ChannelDto] }) channels!: ChannelDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class ChannelReactionDto {
  @ApiProperty({ enum: reactionEmojis }) emoji!: typeof reactionEmojis[number];
  @ApiProperty() count!: number;
  @ApiProperty() active!: boolean;
}
export class ChannelReplyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: TaskPersonDto, nullable: true }) author!: TaskPersonDto | null;
}
export class MessageWorkDto {
  @ApiProperty() id!:string;
  @ApiProperty({enum:['task','event']}) kind!:'task'|'event';
  @ApiProperty({type:String,nullable:true}) targetId!:string|null;
  @ApiProperty({type:String,nullable:true}) title!:string|null;
  @ApiProperty({type:String,nullable:true}) path!:string|null;
  @ApiProperty() canUnlink!:boolean;
  @ApiProperty() version!:number;
}
export class MessageFileDto{
  @ApiProperty() id!:string;@ApiProperty({type:String,nullable:true}) fileId!:string|null;@ApiProperty({type:String,nullable:true}) fileName!:string|null;
  @ApiProperty({type:String,nullable:true}) mime!:string|null;@ApiProperty({type:Number,nullable:true}) byteSize!:number|null;@ApiProperty() canUnlink!:boolean;
}
export class ChannelMessageDto {
  @ApiProperty({type:[MessageFileDto]}) files!:MessageFileDto[];
  @ApiProperty({type:[TaskPersonDto]}) mentions!:TaskPersonDto[];
  @ApiProperty({type:[MessageWorkDto]}) work!:MessageWorkDto[];
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() body!: string;
  @ApiProperty() position!: number;
  @ApiProperty({ type: TaskPersonDto, nullable: true }) author!: TaskPersonDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: ChannelReplyDto, nullable: true }) replyTo!: ChannelReplyDto | null;
  @ApiProperty({ type: [ChannelReactionDto] }) reactions!: ChannelReactionDto[];
}
export class PostChannelMessageDto {
  @ApiPropertyOptional({type:[String],maxItems:5}) fileIds?:string[];
  @ApiPropertyOptional({type:[String],maxItems:100}) mentionedUserIds?:string[];
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ maxLength: 4000 }) body!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' }) replyToId?: string | null;
}
export class ReactChannelMessageDto {
  @ApiProperty({ enum: reactionEmojis }) emoji!: typeof reactionEmojis[number];
  @ApiProperty() active!: boolean;
}
export class ReadChannelDto { @ApiProperty() position!: number; }
export class ChannelHistoryDto {
  @ApiProperty({ type: [ChannelMessageDto] }) messages!: ChannelMessageDto[];
  @ApiProperty({ type: Number, nullable: true }) nextBefore!: number | null;
  @ApiProperty({ type: Number, nullable: true }) nextAfter!: number | null;
  @ApiProperty() latestPosition!: number;
}
export class OpenDirectDto {@ApiProperty({format:'uuid'}) peerId!:string;}
export class MuteConversationDto {@ApiProperty() muted!:boolean;}
export class CreateMessageTaskDto extends CreateTaskDto {
  @ApiProperty({enum:['private','selected']}) declare audience:'private'|'selected';
  @ApiProperty() conversationVersion!:number;
}
export class LinkMessageEventDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiProperty({format:'uuid'}) eventId!:string;
  @ApiProperty() version!:number;
}
export class UnlinkSourceDto {@ApiProperty() version!:number;}
export class MessageSearchItemDto extends ChannelMessageDto {
  @ApiProperty() conversationId!:string;
  @ApiProperty() conversationName!:string;
  @ApiProperty({enum:['channel','dm']}) conversationKind!:'channel'|'dm';
}
export class MessageSearchPageDto {
  @ApiProperty({type:[MessageSearchItemDto]}) messages!:MessageSearchItemDto[];
  @ApiProperty({type:String,nullable:true}) nextCursor!:string|null;
}
export class LinkableEventDto {@ApiProperty() id!:string;@ApiProperty() title!:string;}
export class LinkableEventPageDto {
  @ApiProperty({type:[LinkableEventDto]}) events!:LinkableEventDto[];
  @ApiProperty({type:String,nullable:true}) nextCursor!:string|null;
}
export class MessageSourceDto {
  @ApiProperty() available!:boolean;
  @ApiProperty() label!:string;
  @ApiProperty({type:String,nullable:true}) path!:string|null;
  @ApiProperty() canUnlink!:boolean;
  @ApiProperty() version!:number;
}
export class MessageSourcePageDto {@ApiProperty({type:[MessageSourceDto]}) sources!:MessageSourceDto[];}
