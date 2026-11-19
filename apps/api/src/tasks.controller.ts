import {
  BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { taskStatuses } from "./task-rules.js";
import {
  ArchiveDto, archiveInput, CreateTaskDto, createTaskInput, TaskDefaultsDto, TaskDetailDto, TaskPageDto, TaskStatusDto, taskListQuery,
  taskStatusInput, TaskSummaryDto, UpdateTaskDto, updateTaskInput,
} from "./tasks.dto.js";
import { TasksService } from "./tasks.service.js";

@Controller("api/v1/families/:familyId/tasks")
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "The session is missing or invalid." })
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listTasks" })
  @ApiQuery({ name: "archived", required: false, enum: ["true", "false"], description: "True lists only archived tasks." })
  @ApiQuery({ name: "status", required: false, enum: taskStatuses })
  @ApiQuery({ name: "overdue", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "due", required: false, enum: ["today"], description: "Tasks due today plus unfinished overdue tasks." })
  @ApiQuery({ name: "scope", required: false, enum: ["all", "mine"], description: "Mine means assigned to you, or yours and unassigned." })
  @ApiQuery({ name: "event", required: false, type: String, description: "Only tasks linked to this event." })
  @ApiQuery({ name: "occurrence", required: false, type: String, description: "With event, the original date of one occurrence." })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: TaskPageDto })
  list(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Query() query: Record<string, string>,
  ) {
    const input = taskListQuery.safeParse(query);
    if (!input.success) throw new BadRequestException("Check the task filters.");
    return this.tasks.list(actorId, familyId, input.data);
  }

  @Get("summary")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getTaskSummary" })
  @ApiQuery({ name: "scope", required: false, enum: ["all", "mine"] })
  @ApiOkResponse({ type: TaskSummaryDto })
  summary(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Query("scope") scope?: string,
  ) {
    if (scope !== undefined && scope !== "all" && scope !== "mine") throw new BadRequestException("Check the task filters.");
    return this.tasks.summary(actorId, familyId, scope);
  }

  @Get("defaults")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getTaskDefaults" })
  @ApiOkResponse({ type: TaskDefaultsDto })
  defaults(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.tasks.defaults(actorId, familyId);
  }

  @Get(":taskId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getTask" })
  @ApiOkResponse({ type: TaskDetailDto })
  get(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
  ) {
    return this.tasks.get(actorId, familyId, taskId);
  }

  @Post()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "createTask" })
  @ApiCreatedResponse({ type: TaskDetailDto })
  create(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() body: CreateTaskDto,
  ) {
    const input = createTaskInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Check the task title, due date, assignee, and audience.");
    return this.tasks.create(actorId, familyId, input.data);
  }

  @Put(":taskId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "updateTask" })
  @ApiOkResponse({ type: TaskDetailDto })
  update(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() body: UpdateTaskDto,
  ) {
    const input = updateTaskInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Check the task title, due date, assignee, and audience.");
    return this.tasks.update(actorId, familyId, taskId, input.data);
  }

  @Put(":taskId/status")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "changeTaskStatus" })
  @ApiOkResponse({ type: TaskDetailDto })
  changeStatus(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() body: TaskStatusDto,
  ) {
    const input = taskStatusInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Choose To Do, In Progress, or Completed.");
    return this.tasks.changeStatus(actorId, familyId, taskId, input.data);
  }

  @Put(":taskId/archive")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "archiveTask" })
  @ApiOkResponse({ type: TaskDetailDto })
  archive(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("taskId", ParseUUIDPipe) taskId: string,
    @Body() body: ArchiveDto,
  ) {
    const input = archiveInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Choose whether to archive or restore the task.");
    return this.tasks.archive(actorId, familyId, taskId, input.data);
  }
}
