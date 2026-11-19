import {
  BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, PayloadTooLargeException, Post, Put, Query, Req,
  UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiExtraModels, ApiOkResponse, ApiOperation,
  ApiQuery, ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { maxAttachmentBytes } from "./attachment-storage.service.js";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import {
  AttachmentDownloadDto, CreateEventDto, EventDefaultsDto, EventDetailDto, EventFormDto, eventInput, EventRangeDto,
  OccurrenceChangeDto, occurrenceChangeInput, previewInput, RecurrencePreviewDto, RecurrencePreviewInputDto,
} from "./calendar.dto.js";
import { CalendarService } from "./calendar.service.js";

@Controller("api/v1/families/:familyId/events")
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "The session is missing or invalid." })
@ApiExtraModels(CreateEventDto)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listCalendarEvents" })
  @ApiQuery({ name: "start", required: false, type: String, description: "Inclusive date in the family time zone." })
  @ApiQuery({ name: "end", required: false, type: String, description: "Exclusive date in the family time zone." })
  @ApiOkResponse({ type: EventRangeDto })
  list(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Query("start") start?: string,
    @Query("end") end?: string,
  ) {
    return this.calendar.list(actorId, familyId, start, end);
  }

  @Get("defaults")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getCalendarEventDefaults" })
  @ApiOkResponse({ type: EventDefaultsDto })
  defaults(@Req() { actorId }: AuthenticatedRequest, @Param("familyId", ParseUUIDPipe) familyId: string) {
    return this.calendar.defaults(actorId, familyId);
  }

  @Post("preview")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "previewCalendarRecurrence" })
  @ApiOkResponse({ type: RecurrencePreviewDto })
  preview(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body() body: RecurrencePreviewInputDto,
  ) {
    const input = previewInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Check the event dates and repeat settings.");
    return this.calendar.preview(actorId, familyId, input.data);
  }

  @Get(":eventId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getCalendarEvent" })
  @ApiQuery({ name: "occurrence", required: false, type: String, description: "Original date of a series occurrence." })
  @ApiOkResponse({ type: EventDetailDto })
  get(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Query("occurrence") occurrence?: string,
  ) {
    return this.calendar.get(actorId, familyId, eventId, occurrence);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: maxAttachmentBytes + 1, fields: 1, files: 1, fieldSize: 32 * 1024 },
  }))
  @ApiOperation({ operationId: "createCalendarEvent" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: EventFormDto })
  @ApiCreatedResponse({ type: EventDetailDto })
  create(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Body("event") body: string | undefined,
    @UploadedFile() file?: { buffer: Buffer; originalname: string; size: number },
  ) {
    if (file && file.size > maxAttachmentBytes) throw new PayloadTooLargeException("Choose an attachment up to 5 MB.");
    let json: unknown;
    try {
      json = JSON.parse(body ?? "");
    } catch {
      throw new BadRequestException("Enter valid event details.");
    }
    const input = eventInput.safeParse(json);
    if (!input.success) throw new BadRequestException("Check the event title, dates, and audience.");
    return this.calendar.create(actorId, familyId, input.data, file);
  }

  @Post(":eventId/attachment/download")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "authorizeEventAttachmentDownload" })
  @ApiQuery({ name: "occurrence", required: false, type: String, description: "Original date of a series occurrence." })
  @ApiOkResponse({ type: AttachmentDownloadDto })
  download(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Query("occurrence") occurrence?: string,
  ) {
    return this.calendar.download(actorId, familyId, eventId, occurrence);
  }

  @Put(":eventId/occurrences/:originalDate")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "changeCalendarOccurrence" })
  @ApiOkResponse({ type: EventDetailDto })
  changeOccurrence(
    @Req() { actorId }: AuthenticatedRequest,
    @Param("familyId", ParseUUIDPipe) familyId: string,
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Param("originalDate") originalDate: string,
    @Body() body: OccurrenceChangeDto,
  ) {
    const input = occurrenceChangeInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Check the occurrence change and its dates.");
    return this.calendar.changeOccurrence(actorId, familyId, eventId, originalDate, input.data);
  }
}
