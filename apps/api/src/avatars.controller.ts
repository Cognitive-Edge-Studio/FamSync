import { BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import type { IncomingFile } from './file-validation.js';
import { AvatarsService } from './avatars.service.js';
class AvatarStatusDto {
  @ApiProperty() available!:boolean;
  @ApiProperty() hasAvatar!:boolean;
  @ApiProperty({type:String,nullable:true}) latestId!:string|null;
  @ApiProperty() dailyLimit!:number;
}
class AvatarGenerationDto {
  @ApiProperty() id!:string;
  @ApiProperty({enum:['uploading','queued','working','ready','failed','expired']}) status!:string;
  @ApiProperty({type:String,nullable:true}) previewUrl!:string|null;
  @ApiProperty({type:String,nullable:true}) error!:string|null;
  @ApiProperty() expiresAt!:string;
}
class AvatarUploadDto {
  @ApiProperty({format:'uuid'}) id!:string;
  @ApiProperty({enum:['true']}) consent!:string;
  @ApiProperty({type:'string',format:'binary'}) file!:string;
}
class AvatarResolveInputDto { @ApiProperty({type:[String],maxItems:100}) userIds!:string[]; }
class AvatarUrlDto {
  @ApiProperty() userId!:string;
  @ApiProperty() url!:string;
  @ApiProperty() expiresAt!:string;
}
class AvatarResolveDto { @ApiProperty({type:[AvatarUrlDto]}) avatars!:AvatarUrlDto[]; }
class AvatarSavedDto { @ApiProperty() saved!:boolean; }
@Controller('api/v1') @UseGuards(AuthGuard) @ApiBearerAuth()
export class AvatarsController {
  constructor(private readonly avatars:AvatarsService) {}
  @Get('me/avatar') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getMyAvatarStatus'}) @ApiOkResponse({type:AvatarStatusDto})
  status(@Req(){actorId}:AuthenticatedRequest) { return this.avatars.status(actorId); }
  @Post('me/avatar/generations') @Header('Cache-Control','no-store') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:5*1024*1024,files:1,fields:2,fieldSize:100}}))
  @ApiConsumes('multipart/form-data') @ApiBody({type:AvatarUploadDto}) @ApiOperation({operationId:'createMyAvatar'}) @ApiCreatedResponse({type:AvatarGenerationDto})
  upload(@Req(){actorId}:AuthenticatedRequest,@Body()body:unknown,@UploadedFile()file?:IncomingFile) {
    const parsed=z.strictObject({id:z.uuid(),consent:z.literal('true')}).safeParse(body);
    if(!parsed.success||!file) throw new BadRequestException('Choose a photo and agree to send it for avatar creation.');
    return this.avatars.upload(actorId,parsed.data.id,file);
  }
  @Get('me/avatar/generations/:id') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getMyAvatarGeneration'}) @ApiOkResponse({type:AvatarGenerationDto})
  get(@Req(){actorId}:AuthenticatedRequest,@Param('id',ParseUUIDPipe)id:string) { return this.avatars.get(actorId,id); }
  @Post('me/avatar/generations/:id/accept') @Header('Cache-Control','no-store') @ApiOperation({operationId:'acceptMyAvatar'}) @ApiCreatedResponse({type:AvatarSavedDto})
  accept(@Req(){actorId}:AuthenticatedRequest,@Param('id',ParseUUIDPipe)id:string) { return this.avatars.accept(actorId,id); }
  @Delete('me/avatar') @Header('Cache-Control','no-store') @ApiOperation({operationId:'resetMyAvatar'}) @ApiOkResponse({type:AvatarSavedDto})
  reset(@Req(){actorId}:AuthenticatedRequest) { return this.avatars.reset(actorId); }
  @Post('avatars/resolve') @Header('Cache-Control','no-store') @ApiOperation({operationId:'resolveAvatars'}) @ApiCreatedResponse({type:AvatarResolveDto})
  resolve(@Req(){actorId}:AuthenticatedRequest,@Body()body:AvatarResolveInputDto) {
    const parsed=z.strictObject({userIds:z.array(z.uuid()).min(1).max(100)}).safeParse(body);
    if(!parsed.success) throw new BadRequestException('Choose up to 100 people.');
    return this.avatars.resolve(actorId,[...new Set(parsed.data.userIds)]);
  }
}
