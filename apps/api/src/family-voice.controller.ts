import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { FamilyAiConsentDto, FamilyAiSettingsDto } from "./family-ai.dto.js";
import { familyVoiceConsentInput, FamilyVoiceReplyDto, familyVoiceSettingsInput, FamilyVoiceStatusDto, FamilyVoiceTurnDto, familyVoiceTurnsInput } from "./family-voice.dto.js";
import { FamilyVoiceService, maxRecordingBytes } from "./family-voice.service.js";

@Controller("api/v1/families/:familyId/base/voice")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class FamilyVoiceController {
  constructor(private readonly voice: FamilyVoiceService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getFamilyVoice" })
  @ApiOkResponse({ type: FamilyVoiceStatusDto })
  status(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) { return this.voice.status(actorId, familyId); }

  @Put("settings")
  @ApiOperation({ operationId: "updateFamilyVoice", summary: "Turns voice on or off. Owner only." })
  @ApiOkResponse({ type: FamilyVoiceStatusDto })
  settings(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: FamilyAiSettingsDto) {
    const input = familyVoiceSettingsInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Choose on or off.");
    return this.voice.setEnabled(actorId, familyId, input.data.enabled);
  }

  @Put("consent")
  @ApiOperation({ operationId: "updateFamilyVoiceConsent" })
  @ApiOkResponse({ type: FamilyVoiceStatusDto })
  consent(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: FamilyAiConsentDto) {
    const input = familyVoiceConsentInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Confirm that you are 18 or older.");
    return this.voice.setConsent(actorId, familyId, input.data.accepted);
  }

  @Post("turns")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxRecordingBytes, files: 1, fields: 1, fieldSize: 20_000 } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: FamilyVoiceTurnDto })
  @ApiOperation({ operationId: "talkToFamilyBase" })
  @ApiOkResponse({ type: FamilyVoiceReplyDto })
  talk(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: { turns?: string }, @UploadedFile() file?: { buffer: Buffer }) {
    let turns: unknown = [];
    try { turns = JSON.parse(body.turns ?? "[]"); } catch { turns = null; }
    const input = familyVoiceTurnsInput.safeParse(turns);
    if (!file?.buffer?.length || !input.success) throw new BadRequestException("This recording can’t be used. Try again.");
    return this.voice.talk(actorId, familyId, file.buffer, input.data);
  }
}
