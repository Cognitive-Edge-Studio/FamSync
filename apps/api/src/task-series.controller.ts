import {
  BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { TaskSeriesService } from "./task-series.service.js";
import {
  ArchiveDto, archiveInput, CreateSeriesDto, createSeriesInput, SeriesPreviewDto, SeriesPreviewInputDto, seriesPreviewInput,
  TaskSeriesDto, UpdateSeriesDto, updateSeriesInput,
} from "./tasks.dto.js";

const invalidSeries = "Check the chore title, start date, repeat settings, assignee, and audience.";

@Controller("api/v1/families/:familyId/task-series")
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "The session is missing or invalid." })
export class TaskSeriesController {
  constructor(private readonly series: TaskSeriesService) {}

  @Post("preview")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "previewTaskSeries" })
  @ApiOkResponse({ type: SeriesPreviewDto })
  preview(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() body: SeriesPreviewInputDto,
  ) {
    const input = seriesPreviewInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Check the start date and repeat settings.");
    return this.series.preview(actorId, familyId, input.data);
  }

  @Post()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "createTaskSeries" })
  @ApiCreatedResponse({ type: TaskSeriesDto })
  create(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() body: CreateSeriesDto,
  ) {
    const input = createSeriesInput.safeParse(body);
    if (!input.success) throw new BadRequestException(invalidSeries);
    return this.series.create(actorId, familyId, input.data);
  }

  @Get(":seriesId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getTaskSeries" })
  @ApiOkResponse({ type: TaskSeriesDto })
  get(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("seriesId", ParseUUIDPipe) seriesId: string,
  ) {
    return this.series.get(actorId, familyId, seriesId);
  }

  @Put(":seriesId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "updateTaskSeries" })
  @ApiOkResponse({ type: TaskSeriesDto })
  update(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("seriesId", ParseUUIDPipe) seriesId: string,
    @Body() body: UpdateSeriesDto,
  ) {
    const input = updateSeriesInput.safeParse(body);
    if (!input.success) throw new BadRequestException(invalidSeries);
    return this.series.update(actorId, familyId, seriesId, input.data);
  }

  @Put(":seriesId/archive")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "archiveTaskSeries" })
  @ApiOkResponse({ type: TaskSeriesDto })
  archive(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("seriesId", ParseUUIDPipe) seriesId: string,
    @Body() body: ArchiveDto,
  ) {
    const input = archiveInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Choose whether to archive or restore the chore.");
    return this.series.archive(actorId, familyId, seriesId, input.data);
  }
}
