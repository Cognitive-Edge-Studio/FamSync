import { BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { z } from 'zod';
import { z as schema } from 'zod';
import { TaskDetailDto } from './tasks.dto.js';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { ChannelsService } from './channels.service.js';
import { ArchiveChannelDto, archiveChannelInput, ChannelDetailDto, ChannelHistoryDto, channelHistoryInput, channelListInput,
  ChannelMessageDto, channelMessageInput, ChannelPageDto, channelReactionInput, channelReadInput, CreateChannelDto, createChannelInput,
  PostChannelMessageDto, ReactChannelMessageDto, ReadChannelDto, UpdateChannelDto, updateChannelInput,
  OpenDirectDto,directInput,MuteConversationDto,muteInput,MessageSearchPageDto,messageSearchInput,CreateMessageTaskDto,messageTaskInput,
  LinkMessageEventDto,messageEventInput,LinkableEventPageDto,eventCandidatesInput,MessageSourcePageDto,workSourceInput,UnlinkSourceDto,unlinkSourceInput,EditMessageDto,editMessageInput,ForwardMessageDto,forwardMessageInput,PinMessageDto,pinMessageInput,StarMessageDto,starMessageInput,
  ConversationPreferencesDto,preferencesInput,ChannelAdminDto,channelAdminInput,HandOverChannelDto,handOverInput,LeftChannelDto,starredInput,DeliveredDto,deliveredInput,TypingDto,typingInput,AcknowledgedDto } from './channels.dto.js';
function parsed<T>(schema:z.ZodType<T>,input:unknown):T {const result=schema.safeParse(input);if(!result.success) throw new BadRequestException('Check the channel and message fields.');return result.data;}
@Controller('api/v1/families/:familyId/channels')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ChannelsController {
  constructor(private readonly channels:ChannelsService) {}
  @Get() @Header('Cache-Control','no-store') @ApiOperation({operationId:'listChannels'})
  @ApiQuery({name:'q',required:false,type:String}) @ApiQuery({name:'archived',required:false,enum:['true','false']})
  @ApiQuery({name:'kind',required:false,enum:['channel','dm','all']})
  @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
  @ApiOkResponse({type:ChannelPageDto})
  list(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Query()query:unknown){return this.channels.list(actorId,family,parsed(channelListInput,query));}
  @Post() @ApiOperation({operationId:'createChannel'}) @ApiCreatedResponse({type:ChannelDetailDto})
  create(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Body()body:CreateChannelDto){return this.channels.create(actorId,family,parsed(createChannelInput,body));}
  @Post('direct') @ApiOperation({operationId:'openDirectConversation'}) @ApiCreatedResponse({type:ChannelDetailDto})
  direct(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Body()body:OpenDirectDto){return this.channels.openDirect(actorId,family,parsed(directInput,body).peerId);}
  @Get('starred-messages') @Header('Cache-Control','no-store') @ApiOperation({operationId:'listStarredMessages'}) @ApiOkResponse({type:MessageSearchPageDto})
  @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
  starred(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Query()query:unknown){return this.channels.starred(actorId,family,parsed(starredInput,query));}
  @Put('delivered') @ApiOperation({operationId:'acknowledgeDelivery'}) @ApiOkResponse({type:AcknowledgedDto})
  delivered(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Body()body:DeliveredDto){return this.channels.delivered(actorId,family,parsed(deliveredInput,body).items);}
  @Post(':channelId/typing') @ApiOperation({operationId:'signalTyping'}) @ApiCreatedResponse({type:AcknowledgedDto})
  typing(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:TypingDto){return this.channels.typing(actorId,family,id,parsed(typingInput,body).active);}
  @Put(':channelId/preferences') @ApiOperation({operationId:'setConversationPreferences'}) @ApiOkResponse({type:ChannelDetailDto})
  preferences(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:ConversationPreferencesDto){return this.channels.preferences(actorId,family,id,parsed(preferencesInput,body));}
  @Put(':channelId/admins/:userId') @ApiOperation({operationId:'setChannelAdmin'}) @ApiOkResponse({type:ChannelDetailDto})
  admin(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('userId',ParseUUIDPipe)user:string,@Body()body:ChannelAdminDto){return this.channels.setAdmin(actorId,family,id,user,parsed(channelAdminInput,body));}
  @Put(':channelId/manager') @ApiOperation({operationId:'handOverChannel'}) @ApiOkResponse({type:ChannelDetailDto})
  handOver(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:HandOverChannelDto){return this.channels.handOver(actorId,family,id,parsed(handOverInput,body));}
  @Post(':channelId/leave') @ApiOperation({operationId:'leaveChannel'}) @ApiCreatedResponse({type:LeftChannelDto})
  leave(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string){return this.channels.leave(actorId,family,id);}
  @Post(':channelId/forward') @ApiOperation({operationId:'forwardMessage'}) @ApiCreatedResponse({type:ChannelMessageDto})
  forward(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:ForwardMessageDto){return this.channels.forward(actorId,family,id,parsed(forwardMessageInput,body));}
  @Put(':channelId/messages/:messageId/pin') @ApiOperation({operationId:'pinMessage'}) @ApiOkResponse({type:ChannelMessageDto})
  pin(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,@Body()body:PinMessageDto){return this.channels.pin(actorId,family,id,message,parsed(pinMessageInput,body).pinned);}
  @Put(':channelId/messages/:messageId/star') @ApiOperation({operationId:'starMessage'}) @ApiOkResponse({type:ChannelMessageDto})
  star(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,@Body()body:StarMessageDto){return this.channels.star(actorId,family,id,message,parsed(starMessageInput,body).starred);}
  @Put(':channelId/messages/:messageId') @ApiOperation({operationId:'editMessage'}) @ApiOkResponse({type:ChannelMessageDto})
  edit(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,@Body()body:EditMessageDto){return this.channels.edit(actorId,family,id,message,parsed(editMessageInput,body));}
  @Delete(':channelId/messages/:messageId') @ApiOperation({operationId:'deleteMessage'}) @ApiOkResponse({type:ChannelMessageDto})
  remove(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string){return this.channels.remove(actorId,family,id,message);}
  @Get('message-search') @Header('Cache-Control','no-store') @ApiOperation({operationId:'searchConversationMessages'}) @ApiOkResponse({type:MessageSearchPageDto})
  @ApiQuery({name:'q',required:true,type:String}) @ApiQuery({name:'conversationId',required:false,type:String})
  @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
  search(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Query()query:unknown){return this.channels.search(actorId,family,parsed(messageSearchInput,query));}
  @Get('work-sources') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getWorkMessageSources'}) @ApiOkResponse({type:MessageSourcePageDto})
  @ApiQuery({name:'kind',enum:['task','event']}) @ApiQuery({name:'id',type:String})
  sources(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Query()query:unknown){const input=parsed(workSourceInput,query);return this.channels.workSources(actorId,family,input.kind,input.id);}
  @Delete('task-sources/:taskId') @ApiOperation({operationId:'unlinkTaskMessageSource'}) @ApiOkResponse({type:MessageSourcePageDto})
  unlinkSource(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('taskId',ParseUUIDPipe)task:string,@Body()body:UnlinkSourceDto){return this.channels.unlinkTaskSource(actorId,family,task,parsed(unlinkSourceInput,body).version);}
  @Get(':channelId') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getChannel'}) @ApiOkResponse({type:ChannelDetailDto})
  get(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string){return this.channels.get(actorId,family,id);}
  @Put(':channelId') @ApiOperation({operationId:'updateChannel'}) @ApiOkResponse({type:ChannelDetailDto})
  update(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:UpdateChannelDto){return this.channels.change(actorId,family,id,'details',parsed(updateChannelInput,body));}
  @Put(':channelId/archive') @ApiOperation({operationId:'archiveChannel'}) @ApiOkResponse({type:ChannelDetailDto})
  archive(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:ArchiveChannelDto){return this.channels.change(actorId,family,id,'archive',parsed(archiveChannelInput,body));}
  @Get(':channelId/messages') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getChannelHistory'})
  @ApiQuery({name:'changedSince',required:false,type:Number}) @ApiQuery({name:'from',required:false,type:Number}) @ApiQuery({name:'before',required:false,type:Number}) @ApiQuery({name:'after',required:false,type:Number}) @ApiQuery({name:'limit',required:false,type:Number}) @ApiOkResponse({type:ChannelHistoryDto})
  history(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Query()query:unknown){return this.channels.history(actorId,family,id,parsed(channelHistoryInput,query));}
  @Post(':channelId/messages') @ApiOperation({operationId:'postChannelMessage'}) @ApiCreatedResponse({type:ChannelMessageDto})
  post(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:PostChannelMessageDto){return this.channels.post(actorId,family,id,parsed(channelMessageInput,body));}
  @Put(':channelId/messages/:messageId/reaction') @ApiOperation({operationId:'reactChannelMessage'}) @ApiOkResponse({type:ChannelMessageDto})
  react(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,@Body()body:ReactChannelMessageDto){return this.channels.react(actorId,family,id,message,parsed(channelReactionInput,body));}
  @Put(':channelId/read') @ApiOperation({operationId:'readChannel'}) @ApiOkResponse({type:ChannelDetailDto})
  read(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:ReadChannelDto){return this.channels.read(actorId,family,id,parsed(channelReadInput,body).position);}
  @Put(':channelId/mute') @ApiOperation({operationId:'muteConversation'}) @ApiOkResponse({type:ChannelDetailDto})
  mute(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Body()body:MuteConversationDto){return this.channels.mute(actorId,family,id,parsed(muteInput,body).muted);}
  @Get(':channelId/messages/:messageId') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getConversationMessage'}) @ApiOkResponse({type:ChannelMessageDto})
  message(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string){return this.channels.getMessage(actorId,family,id,message);}
  @Post(':channelId/messages/:messageId/tasks') @ApiOperation({operationId:'createTaskFromMessage'}) @ApiCreatedResponse({type:TaskDetailDto})
  task(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,@Body()body:CreateMessageTaskDto){return this.channels.taskFromMessage(actorId,family,id,message,parsed(messageTaskInput,body));}
  @Get(':channelId/messages/:messageId/events') @Header('Cache-Control','no-store') @ApiOperation({operationId:'listMessageLinkableEvents'}) @ApiOkResponse({type:LinkableEventPageDto})
  @ApiQuery({name:'q',required:false,type:String}) @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
  events(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,@Query()query:unknown){return this.channels.events(actorId,family,id,message,parsed(eventCandidatesInput,query));}
  @Post(':channelId/messages/:messageId/events') @ApiOperation({operationId:'linkMessageEvent'}) @ApiCreatedResponse({type:ChannelMessageDto})
  event(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,@Body()body:LinkMessageEventDto){return this.channels.linkEvent(actorId,family,id,message,parsed(messageEventInput,body));}
  @Delete(':channelId/messages/:messageId/work/:kind/:workId') @ApiOperation({operationId:'unlinkMessageWork'}) @ApiOkResponse({type:ChannelMessageDto})
  unlinkWork(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)id:string,@Param('messageId',ParseUUIDPipe)message:string,
    @Param('kind')kind:string,@Param('workId',ParseUUIDPipe)work:string,@Body()body:UnlinkSourceDto){return this.channels.unlinkWork(actorId,family,id,message,parsed(schema.enum(['task','event']),kind),work,parsed(unlinkSourceInput,body).version);}
}
