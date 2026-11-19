import {BadRequestException,Body,Controller,Delete,Get,Header,Param,ParseUUIDPipe,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {ApiBearerAuth,ApiCreatedResponse,ApiOkResponse,ApiOperation,ApiProperty,ApiQuery} from '@nestjs/swagger';
import {z} from 'zod';
import {AuthGuard,type AuthenticatedRequest} from './auth.guard.js';
import {AcceptInvitationDto,acceptInput} from './family.dto.js';
import {GuestAcceptanceDto,GuestEntryPageDto,GuestInviteInputDto,GuestPolicyDto,GuestWorkspacePageDto,guestInviteInput,guestPageInput,guestPolicyInput,guestWorkspaceInput} from './guests.dto.js';
import {GuestsService} from './guests.service.js';
class GuestMutationDto{@ApiProperty() id!:string;}
function parse<T>(schema:z.ZodType<T>,input:unknown){const r=schema.safeParse(input);if(!r.success)throw new BadRequestException('Check the guest request details.');return r.data;}
@Controller('api/v1') @UseGuards(AuthGuard) @ApiBearerAuth()
export class GuestsController{
 constructor(private readonly guests:GuestsService){}
 @Get('families/:familyId/guest-policy') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getGuestPolicy'}) @ApiOkResponse({type:GuestPolicyDto})
 policy(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string){return this.guests.policy(actorId,f);}
 @Put('families/:familyId/guest-policy') @ApiOperation({operationId:'setGuestPolicy'}) @ApiOkResponse({type:GuestPolicyDto})
 setPolicy(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Body()body:GuestPolicyDto){return this.guests.setPolicy(actorId,f,parse(guestPolicyInput,body));}
 @Get('families/:familyId/guest-access') @Header('Cache-Control','no-store') @ApiOperation({operationId:'listGuestAccess'}) @ApiOkResponse({type:GuestEntryPageDto})
 @ApiQuery({name:'channelId',required:false,type:String}) @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
 list(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Query()q:unknown){return this.guests.list(actorId,f,parse(guestPageInput,q));}
 @Post('families/:familyId/channels/:channelId/guest-invitations') @ApiOperation({operationId:'inviteChannelGuest'}) @ApiCreatedResponse({type:GuestMutationDto})
 invite(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Body()b:GuestInviteInputDto){return this.guests.invite(actorId,f,c,parse(guestInviteInput,b));}
 @Post('families/:familyId/channels/:channelId/guest-invitations/:invitationId/resend') @ApiOperation({operationId:'resendChannelGuest'}) @ApiCreatedResponse({type:GuestMutationDto})
 resend(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Param('invitationId',ParseUUIDPipe)i:string){return this.guests.resend(actorId,f,c,i);}
 @Delete('families/:familyId/channels/:channelId/guest-invitations/:invitationId') @ApiOperation({operationId:'revokeGuestInvitation'}) @ApiOkResponse({type:GuestMutationDto})
 revokeInvitation(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Param('invitationId',ParseUUIDPipe)i:string){return this.guests.revoke(actorId,f,c,i,'invitation');}
 @Delete('families/:familyId/channels/:channelId/guests/:userId') @ApiOperation({operationId:'revokeChannelGuest'}) @ApiOkResponse({type:GuestMutationDto})
 revokeGrant(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Param('userId',ParseUUIDPipe)i:string){return this.guests.revoke(actorId,f,c,i,'grant');}
 @Post('guest-invitations/accept') @ApiOperation({operationId:'acceptChannelGuest'}) @ApiCreatedResponse({type:GuestAcceptanceDto})
 accept(@Req(){actorId}:AuthenticatedRequest,@Body()b:AcceptInvitationDto){return this.guests.accept(actorId,parse(acceptInput,b).token);}
 @Get('guest-channels') @Header('Cache-Control','no-store') @ApiOperation({operationId:'listGuestChannels'}) @ApiOkResponse({type:GuestWorkspacePageDto})
 @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
 workspaces(@Req(){actorId}:AuthenticatedRequest,@Query()q:unknown){return this.guests.workspaces(actorId,parse(guestWorkspaceInput,q));}
}
