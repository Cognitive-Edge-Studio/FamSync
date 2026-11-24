import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import type { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import {
  FamilyAiAnswerDto, FamilyAiConsentDto, familyAiConsentInput, FamilyAiQuestionDto, familyAiQuestionInput,
  FamilyAiSettingsDto, familyAiSettingsInput, FamilyAiStatusDto,
} from "./family-ai.dto.js";
import { FamilyAiService } from "./family-ai.service.js";

function parsed<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(message);
  return result.data;
}

@Controller("api/v1/families/:familyId/base/ai")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class FamilyAiController {
  constructor(private readonly ai: FamilyAiService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getFamilyAi" })
  @ApiOkResponse({ type: FamilyAiStatusDto })
  status(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.ai.status(actorId, familyId);
  }

  @Put("settings")
  @ApiOperation({ operationId: "updateFamilyAi", summary: "Turns questions on or off. Owner only." })
  @ApiOkResponse({ type: FamilyAiStatusDto })
  settings(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: FamilyAiSettingsDto) {
    return this.ai.setEnabled(actorId, familyId, parsed(familyAiSettingsInput, body, "Choose on or off.").enabled);
  }

  @Put("consent")
  @ApiOperation({ operationId: "updateFamilyAiConsent" })
  @ApiOkResponse({ type: FamilyAiStatusDto })
  consent(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: FamilyAiConsentDto) {
    return this.ai.setConsent(actorId, familyId, parsed(familyAiConsentInput, body, "Confirm that you are 18 or older.").accepted);
  }

  @Post("questions")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "askFamilyBase" })
  @ApiOkResponse({ type: FamilyAiAnswerDto })
  ask(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: FamilyAiQuestionDto) {
    return this.ai.ask(actorId, familyId, parsed(familyAiQuestionInput, body, "Ask a question of 3 to 500 characters.").question);
  }
}
