import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import type { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import {
  AddFamilyHelperFactDto, AddFamilyHelperListItemDto, FamilyHelperAnswerDto, FamilyHelperAskDto, FamilyHelperChannelDto, FamilyHelperChannelStateDto, FamilyHelperFactDto,
  FamilyHelperListItemDto, FamilyHelperStatusDto, helperAskInput, helperChannelInput, helperFactInput, helperListDoneInput, helperListItemInput, saveHelperInput,
  SaveFamilyHelperDto, SetFamilyHelperListItemDto,
} from "./family-helper.dto.js";
import { FamilyHelperService } from "./family-helper.service.js";

function parsed<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(message);
  return result.data;
}

@Controller("api/v1/families/:familyId/helper")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class FamilyHelperController {
  constructor(private readonly helper: FamilyHelperService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getFamilyHelper" })
  @ApiOkResponse({ type: FamilyHelperStatusDto })
  status(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.helper.status(actorId, familyId);
  }

  @Put()
  @ApiOperation({ operationId: "saveFamilyHelper", summary: "Adds the Family Helper, or renames it." })
  @ApiOkResponse({ type: FamilyHelperStatusDto })
  save(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: SaveFamilyHelperDto) {
    return this.helper.save(actorId, familyId, parsed(saveHelperInput, body, "Give the helper a name of up to 40 characters."));
  }

  @Post("ask")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "askFamilyHelper" })
  @ApiOkResponse({ type: FamilyHelperAnswerDto })
  ask(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: FamilyHelperAskDto) {
    const input = parsed(helperAskInput, body, "Write a message of up to 2,000 characters.");
    return this.helper.ask(actorId, familyId, input.message, input.history);
  }

  @Put("channels/:channelId")
  @ApiOperation({ operationId: "setFamilyHelperInChannel", summary: "Adds the helper to a conversation or removes it." })
  @ApiOkResponse({ type: FamilyHelperChannelStateDto })
  channel(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("channelId", ParseUUIDPipe) channelId: string, @Body() body: FamilyHelperChannelDto) {
    return this.helper.setChannel(actorId, familyId, channelId, parsed(helperChannelInput, body, "Choose on or off.").enabled);
  }

  @Get("list")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listFamilyHelperItems" })
  @ApiOkResponse({ type: [FamilyHelperListItemDto] })
  list(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.helper.list(actorId, familyId);
  }

  @Post("list")
  @HttpCode(200)
  @ApiOperation({ operationId: "addFamilyHelperItem" })
  @ApiOkResponse({ type: [FamilyHelperListItemDto] })
  add(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: AddFamilyHelperListItemDto) {
    return this.helper.addItem(actorId, familyId, parsed(helperListItemInput, body, "Write an item of up to 120 characters.").title);
  }

  @Delete("list/done")
  @ApiOperation({ operationId: "clearDoneFamilyHelperItems" })
  @ApiOkResponse({ type: [FamilyHelperListItemDto] })
  clear(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.helper.clearDone(actorId, familyId);
  }

  @Put("list/:itemId")
  @ApiOperation({ operationId: "setFamilyHelperItem" })
  @ApiOkResponse({ type: [FamilyHelperListItemDto] })
  done(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string, @Body() body: SetFamilyHelperListItemDto) {
    return this.helper.setItemDone(actorId, familyId, itemId, parsed(helperListDoneInput, body, "Choose done or not done.").done);
  }

  @Delete("list/:itemId")
  @ApiOperation({ operationId: "removeFamilyHelperItem" })
  @ApiOkResponse({ type: [FamilyHelperListItemDto] })
  remove(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Param("itemId", ParseUUIDPipe) itemId: string) {
    return this.helper.removeItem(actorId, familyId, itemId);
  }

  @Get("memory")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listFamilyHelperMemory" })
  @ApiOkResponse({ type: [FamilyHelperFactDto] })
  memory(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.helper.memory(actorId, familyId);
  }

  @Post("memory")
  @HttpCode(200)
  @ApiOperation({ operationId: "addFamilyHelperFact" })
  @ApiOkResponse({ type: [FamilyHelperFactDto] })
  remember(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Body() body: AddFamilyHelperFactDto) {
    const input = parsed(helperFactInput, body, "Write a fact of up to 300 characters.");
    return this.helper.remember(actorId, familyId, input.fact, input.aboutUserId ?? null);
  }

  @Delete("memory/:factId")
  @ApiOperation({ operationId: "forgetFamilyHelperFact" })
  @ApiOkResponse({ type: [FamilyHelperFactDto] })
  forget(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Param("factId", ParseUUIDPipe) factId: string) {
    return this.helper.forget(actorId, familyId, factId);
  }
}
