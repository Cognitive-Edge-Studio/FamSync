import { BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import type { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { FamilyBaseGraphDto } from "./family-base.dto.js";
import { FamilyBaseService } from "./family-base.service.js";
import {
  CreateFamilyEntryDto, createFamilyEntryInput, FamilyEntryDefaultsDto, FamilyEntryDeletedDto, FamilyEntryDto,
  FamilyEntryVersionDto, familyEntryVersionInput, UpdateFamilyEntryDto, updateFamilyEntryInput,
} from "./family-entries.dto.js";
import { FamilyEntriesService } from "./family-entries.service.js";

function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException("Check the entry details.");
  return result.data;
}

@Controller("api/v1/families/:familyId/base")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class FamilyBaseController {
  constructor(private readonly familyBase: FamilyBaseService, private readonly entries: FamilyEntriesService) {}

  @Get("graph")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getFamilyBaseGraph", summary: "Everything the caller can see in Family Base, with its relationships." })
  @ApiOkResponse({ type: FamilyBaseGraphDto })
  graph(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.familyBase.graph(actorId, familyId);
  }

  @Get("entries/defaults")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getFamilyEntryDefaults" })
  @ApiOkResponse({ type: FamilyEntryDefaultsDto })
  defaults(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.entries.defaults(actorId, familyId);
  }

  @Get("entries/:entryId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getFamilyEntry" })
  @ApiOkResponse({ type: FamilyEntryDto })
  get(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("entryId", ParseUUIDPipe) id: string) {
    return this.entries.get(actorId, familyId, id);
  }

  @Post("entries")
  @ApiOperation({ operationId: "createFamilyEntry" })
  @ApiCreatedResponse({ type: FamilyEntryDto })
  create(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() body: CreateFamilyEntryDto) {
    return this.entries.create(actorId, familyId, parsed(createFamilyEntryInput, body));
  }

  @Put("entries/:entryId")
  @ApiOperation({ operationId: "updateFamilyEntry" })
  @ApiOkResponse({ type: FamilyEntryDto })
  update(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("entryId", ParseUUIDPipe) id: string, @Body() body: UpdateFamilyEntryDto) {
    return this.entries.update(actorId, familyId, id, parsed(updateFamilyEntryInput, body));
  }

  @Delete("entries/:entryId")
  @ApiOperation({ operationId: "deleteFamilyEntry" })
  @ApiOkResponse({ type: FamilyEntryDeletedDto })
  remove(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("entryId", ParseUUIDPipe) id: string, @Body() body: FamilyEntryVersionDto) {
    return this.entries.remove(actorId, familyId, id, parsed(familyEntryVersionInput, body).version);
  }
}
