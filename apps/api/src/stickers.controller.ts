import {BadRequestException,Body,Controller,Get,Header,Param,ParseUUIDPipe,Post,Req,UseGuards} from '@nestjs/common';
import {ApiBearerAuth,ApiCreatedResponse,ApiOkResponse,ApiOperation,ApiProperty} from '@nestjs/swagger';
import {z} from 'zod';
import {AuthGuard,type AuthenticatedRequest} from './auth.guard.js';
import {StickersService} from './stickers.service.js';
import {StoredFileDto} from './files.dto.js';
import {stickerKeys} from './sticker-image.js';
class StickerPackDto{
  @ApiProperty() id!:string;
  @ApiProperty() status!:string;
  @ApiProperty({type:String,nullable:true}) error!:string|null;
}
class AvatarStickerDto{
  @ApiProperty({enum:stickerKeys}) expression!:string;
  @ApiProperty() label!:string;
  @ApiProperty() url!:string;
  @ApiProperty() expiresAt!:string;
}
class AvatarStickersDto{
  @ApiProperty() available!:boolean;
  @ApiProperty() hasAvatar!:boolean;
  @ApiProperty({type:StickerPackDto,nullable:true}) pack!:StickerPackDto|null;
  @ApiProperty({type:[AvatarStickerDto]}) stickers!:AvatarStickerDto[];
}
class CreateStickersDto{@ApiProperty({format:'uuid'}) id!:string;}
class PrepareStickerDto extends CreateStickersDto{
  @ApiProperty({format:'uuid'}) packId!:string;
  @ApiProperty({enum:stickerKeys}) expression!:string;
}
@Controller('api/v1') @UseGuards(AuthGuard) @ApiBearerAuth()
export class StickersController{
  constructor(private readonly stickers:StickersService){}
  @Get('me/avatar/stickers') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getMyAvatarStickers'}) @ApiOkResponse({type:AvatarStickersDto})
  status(@Req(){actorId}:AuthenticatedRequest){return this.stickers.status(actorId);}
  @Post('me/avatar/stickers') @Header('Cache-Control','no-store') @ApiOperation({operationId:'createMyAvatarStickers'}) @ApiCreatedResponse({type:AvatarStickersDto})
  create(@Req(){actorId}:AuthenticatedRequest,@Body()body:CreateStickersDto){
    const parsed=z.strictObject({id:z.uuid()}).safeParse(body);if(!parsed.success)throw new BadRequestException('Start a new sticker request.');return this.stickers.create(actorId,parsed.data.id);
  }
  @Post('families/:familyId/channels/:channelId/stickers') @Header('Cache-Control','no-store') @ApiOperation({operationId:'prepareAvatarSticker'}) @ApiCreatedResponse({type:StoredFileDto})
  prepare(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)family:string,@Param('channelId',ParseUUIDPipe)channel:string,@Body()body:PrepareStickerDto){
    const parsed=z.strictObject({id:z.uuid(),packId:z.uuid(),expression:z.enum(stickerKeys)}).safeParse(body);
    if(!parsed.success)throw new BadRequestException('Choose a sticker.');const {id,packId,expression}=parsed.data;return this.stickers.prepare(actorId,family,channel,packId,expression,id);
  }
}
