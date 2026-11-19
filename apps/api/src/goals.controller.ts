import {
  BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery } from "@nestjs/swagger";
import type { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import {
  AddGoalItemDto, addGoalItemInput, CreateGoalDto, createGoalInput, GoalArchiveDto, goalArchiveInput,
  GoalDefaultsDto, GoalDetailDto, goalListInput, GoalPageDto, GoalProgressDto, goalProgressInput, GoalSummaryDto,
  GoalVersionDto, goalVersion, UpdateGoalDto, updateGoalInput, UpdateGoalItemDto, updateGoalItemInput,
  LinkGoalTaskDto, linkGoalTaskInput, linkableTasksInput, LinkableTaskPageDto,
} from "./goals.dto.js";
import { GoalsService } from "./goals.service.js";

function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException("Check the goal fields and progress values.");
  return result.data;
}

@Controller("api/v1/families/:familyId/goals")
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listGoals" })
  @ApiQuery({ name: "status", required: false, enum: ["active", "completed"] })
  @ApiQuery({ name: "archived", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "type", required: false, enum: ["family", "individual"] })
  @ApiQuery({ name: "scope", required: false, enum: ["mine", "all"] })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: GoalPageDto })
  list(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Query() query: unknown) {
    return this.goals.list(actorId, familyId, parsed(goalListInput, query));
  }

  @Get("summary")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getGoalSummary" })
  @ApiQuery({ name: "type", required: false, enum: ["family", "individual"] })
  @ApiQuery({ name: "scope", required: false, enum: ["mine", "all"] })
  @ApiOkResponse({ type: GoalSummaryDto })
  summary(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string, @Query() query: unknown) {
    return this.goals.summary(actorId, familyId, parsed(goalListInput, query));
  }

  @Get("defaults")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getGoalDefaults" })
  @ApiOkResponse({ type: GoalDefaultsDto })
  defaults(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.goals.defaults(actorId, familyId);
  }

  @Get(":goalId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getGoal" })
  @ApiOkResponse({ type: GoalDetailDto })
  get(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string) {
    return this.goals.get(actorId, familyId, id);
  }

  @Get(":goalId/linkable-tasks")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listGoalLinkableTasks" })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: LinkableTaskPageDto })
  linkable(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Query() query: unknown) {
    return this.goals.linkableTasks(actorId, familyId, id, parsed(linkableTasksInput, query));
  }

  @Post(":goalId/task-links")
  @ApiOperation({ operationId: "linkGoalTask" })
  @ApiCreatedResponse({ type: GoalDetailDto })
  link(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Body() body: LinkGoalTaskDto) {
    return this.goals.linkTask(actorId, familyId, id, parsed(linkGoalTaskInput, body));
  }

  @Delete(":goalId/task-links/:itemId")
  @ApiOperation({ operationId: "unlinkGoalTask" })
  @ApiOkResponse({ type: GoalDetailDto })
  unlink(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Param("itemId", ParseUUIDPipe) itemId: string, @Body() body: GoalVersionDto) {
    return this.goals.unlinkTask(actorId, familyId, id, itemId, parsed(goalVersion, body).version);
  }

  @Post()
  @ApiOperation({ operationId: "createGoal" })
  @ApiCreatedResponse({ type: GoalDetailDto })
  create(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() body: CreateGoalDto) {
    return this.goals.create(actorId, familyId, parsed(createGoalInput, body));
  }

  @Put(":goalId")
  @ApiOperation({ operationId: "updateGoal" })
  @ApiOkResponse({ type: GoalDetailDto })
  update(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Body() body: UpdateGoalDto) {
    return this.goals.update(actorId, familyId, id, parsed(updateGoalInput, body));
  }

  @Put(":goalId/progress")
  @ApiOperation({ operationId: "updateGoalProgress" })
  @ApiOkResponse({ type: GoalDetailDto })
  progress(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Body() body: GoalProgressDto) {
    return this.goals.change(actorId, familyId, id, "progress", parsed(goalProgressInput, body));
  }

  @Put(":goalId/archive")
  @ApiOperation({ operationId: "archiveGoal" })
  @ApiOkResponse({ type: GoalDetailDto })
  archive(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Body() body: GoalArchiveDto) {
    return this.goals.change(actorId, familyId, id, "archive", parsed(goalArchiveInput, body));
  }

  @Post(":goalId/checklist")
  @ApiOperation({ operationId: "addGoalChecklistItem" })
  @ApiCreatedResponse({ type: GoalDetailDto })
  addItem(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Body() body: AddGoalItemDto) {
    return this.goals.change(actorId, familyId, id, "add_item", parsed(addGoalItemInput, body));
  }

  @Put(":goalId/checklist/:itemId")
  @ApiOperation({ operationId: "updateGoalChecklistItem" })
  @ApiOkResponse({ type: GoalDetailDto })
  item(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: UpdateGoalItemDto) {
    return this.goals.change(actorId, familyId, id, "item", { ...parsed(updateGoalItemInput, body), id: itemId });
  }

  @Delete(":goalId/checklist/:itemId")
  @ApiOperation({ operationId: "deleteGoalChecklistItem" })
  @ApiOkResponse({ type: GoalDetailDto })
  removeItem(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("goalId", ParseUUIDPipe) id: string, @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: GoalVersionDto) {
    return this.goals.change(actorId, familyId, id, "delete_item", { ...parsed(goalVersion, body), id: itemId });
  }
}
