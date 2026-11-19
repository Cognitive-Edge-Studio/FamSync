import {BadRequestException,Body,Controller,Delete,Get,Header,Param,ParseUUIDPipe,Post,Put,Query,Req,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ApiBearerAuth,ApiBody,ApiConsumes,ApiCreatedResponse,ApiOkResponse,ApiOperation,ApiQuery} from '@nestjs/swagger';import {z} from 'zod';
import {AuthGuard,type AuthenticatedRequest} from './auth.guard.js';import {FilesService} from './files.service.js';import type {IncomingFile} from './file-validation.js';
import {CreateFolderDto,EditFolderDto,FileArchiveDto,FileGrantDto,FileMutationDto,FilePageDto,FilePreviewDto,FileUploadDto,FileVersionDto,FolderDto,FolderPageDto,StoredFileDto,fileArchiveInput,fileListInput,fileUploadInput,folderCreateInput,folderEditInput,folderListInput} from './files.dto.js';
const upload=(image=false)=>FileInterceptor('file',{limits:{fileSize:(image?2:5)*1024*1024+1,fields:2,files:1,fieldSize:1000}});
function parse<T>(schema:z.ZodType<T>,value:unknown){const r=schema.safeParse(value);if(!r.success)throw new BadRequestException('Check the file or folder request details.');return r.data;}
function required(file?:IncomingFile){if(!file)throw new BadRequestException('Choose a file.');return file;}
@Controller('api/v1/families/:familyId') @UseGuards(AuthGuard) @ApiBearerAuth()
export class FilesController{
 constructor(private readonly files:FilesService){}
 @Get('folders') @Header('Cache-Control','no-store') @ApiOperation({operationId:'listFolders'}) @ApiOkResponse({type:FolderPageDto})
 @ApiQuery({name:'channelId',required:false,type:String}) @ApiQuery({name:'kind',required:false,enum:['all','family','channel']}) @ApiQuery({name:'q',required:false,type:String}) @ApiQuery({name:'archived',required:false,enum:['true','false']}) @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
 list(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Query()q:unknown){return this.files.listFolders(actorId,f,parse(folderListInput,q));}
 @Post('folders') @ApiOperation({operationId:'createFolder'}) @ApiCreatedResponse({type:FolderDto})
 create(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Body()b:CreateFolderDto){return this.files.createFolder(actorId,f,parse(folderCreateInput,b));}
 @Get('folders/:folderId') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getFolder'}) @ApiOkResponse({type:FolderDto})
 get(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('folderId',ParseUUIDPipe)d:string){return this.files.getFolder(actorId,f,d);}
 @Put('folders/:folderId') @ApiOperation({operationId:'editFolder'}) @ApiOkResponse({type:FolderDto})
 edit(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('folderId',ParseUUIDPipe)d:string,@Body()b:EditFolderDto){return this.files.editFolder(actorId,f,d,parse(folderEditInput,b));}
 @Put('folders/:folderId/archive') @ApiOperation({operationId:'archiveFolder'}) @ApiOkResponse({type:FolderDto})
 archive(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('folderId',ParseUUIDPipe)d:string,@Body()b:FileArchiveDto){return this.files.archiveFolder(actorId,f,d,parse(fileArchiveInput,b));}
 @Get('files') @Header('Cache-Control','no-store') @ApiOperation({operationId:'listStoredFiles'}) @ApiOkResponse({type:FilePageDto})
 @ApiQuery({name:'folderId',required:false,type:String}) @ApiQuery({name:'channelId',required:false,type:String}) @ApiQuery({name:'q',required:false,type:String}) @ApiQuery({name:'archived',required:false,enum:['true','false']}) @ApiQuery({name:'type',required:false,enum:['all','image','document']}) @ApiQuery({name:'sort',required:false,enum:['name','name-desc','recent','oldest']}) @ApiQuery({name:'cursor',required:false,type:String}) @ApiQuery({name:'limit',required:false,type:Number})
 listFiles(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Query()q:unknown){return this.files.files(actorId,f,parse(fileListInput,q));}
 @Get('files/:fileId') @Header('Cache-Control','no-store') @ApiOperation({operationId:'getStoredFile'}) @ApiOkResponse({type:StoredFileDto})
 file(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('fileId',ParseUUIDPipe)i:string){return this.files.getFile(actorId,f,i);}
 @Post('folders/:folderId/files') @UseInterceptors(upload()) @ApiConsumes('multipart/form-data') @ApiBody({type:FileUploadDto}) @ApiOperation({operationId:'uploadFolderFile'}) @ApiCreatedResponse({type:StoredFileDto})
 upload(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('folderId',ParseUUIDPipe)d:string,@Body()b:unknown,@UploadedFile()file?:IncomingFile){return this.files.upload(actorId,f,{folder:d},parse(fileUploadInput,b),required(file));}
 @Put('files/:fileId/archive') @ApiOperation({operationId:'archiveStoredFile'}) @ApiOkResponse({type:StoredFileDto})
 archiveFile(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('fileId',ParseUUIDPipe)i:string,@Body()b:FileArchiveDto){return this.files.archiveFile(actorId,f,i,parse(fileArchiveInput,b));}
 @Post('files/:fileId/download') @Header('Cache-Control','no-store') @ApiOperation({operationId:'openStoredFile'}) @ApiCreatedResponse({type:FileGrantDto})
 download(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('fileId',ParseUUIDPipe)i:string){return this.files.download(actorId,f,i);}
 @Post('files/:fileId/preview') @Header('Cache-Control','no-store') @ApiOperation({operationId:'previewStoredFile'}) @ApiCreatedResponse({type:FilePreviewDto})
 preview(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('fileId',ParseUUIDPipe)i:string){return this.files.preview(actorId,f,i);}
 @Post('channels/:channelId/image') @UseInterceptors(upload(true)) @ApiConsumes('multipart/form-data') @ApiBody({type:FileUploadDto}) @ApiOperation({operationId:'uploadChannelImage'}) @ApiCreatedResponse({type:StoredFileDto})
 image(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Body()b:unknown,@UploadedFile()file?:IncomingFile){return this.files.upload(actorId,f,{image:c},parse(fileUploadInput,b),required(file));}
 @Post('channels/:channelId/image/open') @Header('Cache-Control','no-store') @ApiOperation({operationId:'openChannelImage'}) @ApiCreatedResponse({type:FilePreviewDto})
 openImage(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string){return this.files.channelImage(actorId,f,c);}
 @Delete('channels/:channelId/image') @ApiOperation({operationId:'removeChannelImage'}) @ApiOkResponse({type:FileMutationDto})
 removeImage(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Body()b:FileVersionDto){const input=parse(z.strictObject({version:z.int().positive()}),b);return this.files.removeImage(actorId,f,c,input.version);}
 @Post('channels/:channelId/messages/:messageId/files/:fileId') @ApiOperation({operationId:'attachMessageFile'}) @ApiCreatedResponse({type:FileMutationDto})
 link(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Param('messageId',ParseUUIDPipe)m:string,@Param('fileId',ParseUUIDPipe)i:string){return this.files.link(actorId,f,c,m,i);}
 @Delete('channels/:channelId/messages/:messageId/files/:linkId') @ApiOperation({operationId:'unlinkMessageFile'}) @ApiOkResponse({type:FileMutationDto})
 unlink(@Req(){actorId}:AuthenticatedRequest,@Param('familyId',ParseUUIDPipe)f:string,@Param('channelId',ParseUUIDPipe)c:string,@Param('messageId',ParseUUIDPipe)m:string,@Param('linkId',ParseUUIDPipe)i:string){return this.files.unlink(actorId,f,c,m,i);}
}
