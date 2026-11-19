import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { z } from "zod";

export const itemAudiences = ["family", "selected", "private"] as const;
export type ItemAudience = typeof itemAudiences[number];
export const dateInput = z.iso.date().regex(/^[1-9]/);
const localMinute = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const frequencies = ["daily", "weekly", "monthly"] as const;
const recurrenceRule = z.strictObject({
  frequency: z.enum(frequencies),
  interval: z.int().min(1).max(2147483647),
  until: dateInput,
});
export type RecurrenceRule = z.infer<typeof recurrenceRule>;

const allDaySchedule = { allDay: z.literal(true), start: dateInput, end: dateInput };
const timedSchedule = { allDay: z.literal(false), start: localMinute, end: localMinute };
export const scheduleInput = z.discriminatedUnion("allDay", [
  z.strictObject(allDaySchedule), z.strictObject(timedSchedule),
]);
export const previewInput = z.discriminatedUnion("allDay", [
  z.strictObject({ ...allDaySchedule, recurrence: recurrenceRule }),
  z.strictObject({ ...timedSchedule, recurrence: recurrenceRule }),
]);
export const occurrenceChangeInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("cancel") }),
  z.strictObject({
    action: z.literal("move"), start: z.union([dateInput, localMinute]), end: z.union([dateInput, localMinute]),
    shiftLinkedTasks: z.array(z.strictObject({ id: z.uuid(), version: z.int().min(1) })).max(50).optional(),
  }),
]);
export type OccurrenceChange = z.infer<typeof occurrenceChangeInput>;

const eventFields = {
  id: z.uuid(),
  title: z.string().trim().min(1).max(120).refine((value) => !value.includes("\0")),
  note: z.string().trim().max(2000).refine((value) => !value.includes("\0")),
  location: z.string().trim().max(200).refine((value) => !value.includes("\0")),
  audience: z.enum(itemAudiences).optional(),
  selectedMemberIds: z.array(z.uuid()).optional(),
  recurrence: recurrenceRule.optional(),
  remindMinutes: z.union([z.literal(0), z.literal(15), z.literal(60), z.literal(1440)]).nullable().optional(),
  remindAudience: z.enum(["me", "everyone"]).optional(),
};
export const eventInput = z.discriminatedUnion("allDay", [
  z.strictObject({ ...eventFields, ...allDaySchedule }),
  z.strictObject({ ...eventFields, ...timedSchedule }),
]);
export type EventInput = z.infer<typeof eventInput>;

export class RecurrenceRuleDto implements RecurrenceRule {
  @ApiProperty({ enum: frequencies })
  frequency!: RecurrenceRule["frequency"];

  @ApiProperty({ minimum: 1 })
  interval!: number;

  @ApiProperty({ format: "date", description: "The inclusive final start date." })
  until!: string;
}

class ScheduleDto {
  @ApiProperty()
  allDay!: boolean;

  @ApiProperty({ description: "A local date for an all-day event or a local date and minute in the family time zone." })
  start!: string;

  @ApiProperty({ description: "The exclusive end, as a local date or a local date and minute." })
  end!: string;
}

export class RecurrencePreviewInputDto extends ScheduleDto {
  @ApiProperty({ type: RecurrenceRuleDto })
  recurrence!: RecurrenceRuleDto;
}

export class CreateEventDto extends ScheduleDto {
  @ApiProperty({ format: "uuid", description: "A client-generated ID reused when retrying the same save." })
  id!: string;

  @ApiProperty({ maxLength: 120 })
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  note!: string;

  @ApiProperty({ maxLength: 200 })
  location!: string;

  @ApiPropertyOptional({ type: RecurrenceRuleDto })
  recurrence?: RecurrenceRuleDto;

  @ApiPropertyOptional({ enum: itemAudiences })
  audience?: ItemAudience;

  @ApiPropertyOptional({ type: [String] })
  selectedMemberIds?: string[];

  @ApiPropertyOptional({ type: Number, nullable: true, enum: [0, 15, 60, 1440],
    description: "Minutes before the due time. Date-only items count from 08:00. Null turns the reminder off." })
  remindMinutes?: 0 | 15 | 60 | 1440 | null;

  @ApiPropertyOptional({ enum: ["me", "everyone"], description: "Who gets the reminder. Defaults to the creator only." })
  remindAudience?: "me" | "everyone";
}

export class EventFormDto {
  @ApiProperty({ description: "JSON-encoded CreateEventDto." })
  event!: string;

  @ApiPropertyOptional({ type: "string", format: "binary" })
  file?: string;
}

export class EventDefaultsDto {
  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;
}

export class OccurrenceDto {
  @ApiProperty({ format: "date", description: "The original start date in the series time zone." })
  originalDate!: string;

  @ApiProperty({ enum: ["scheduled", "moved", "cancelled"] })
  status!: "scheduled" | "moved" | "cancelled";
}

export class OccurrenceChangeDto {
  @ApiProperty({ enum: ["move", "cancel"] })
  action!: OccurrenceChange["action"];

  @ApiPropertyOptional({ description: "Move start in the series time zone." })
  start?: string;

  @ApiPropertyOptional({ description: "Exclusive move end in the series time zone." })
  end?: string;

  @ApiPropertyOptional({ type: () => [ShiftTaskDto], description: "Linked tasks you created whose due dates move by the same number of days." })
  shiftLinkedTasks?: ShiftTaskDto[];
}

export class ShiftTaskDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ description: "The task version the shift is based on." })
  version!: number;
}

export class PreviewOccurrenceDto {
  @ApiProperty({ format: "date" })
  originalDate!: string;

  @ApiProperty({ description: "A local date for all-day events or a UTC instant for timed events." })
  start!: string;

  @ApiProperty({ description: "Exclusive end, as a local date or a UTC instant." })
  end!: string;
}

export class RecurrencePreviewDto {
  @ApiProperty({ type: [PreviewOccurrenceDto] })
  occurrences!: PreviewOccurrenceDto[];

  @ApiProperty()
  hasMore!: boolean;

  @ApiProperty()
  timeZone!: string;
}

export class EventSummaryDto extends EventDefaultsDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  allDay!: boolean;

  @ApiProperty({ description: "A local date for all-day events or a UTC instant for timed events." })
  start!: string;

  @ApiProperty({ description: "Exclusive end, as a local date or a UTC instant." })
  end!: string;

  @ApiPropertyOptional({ type: OccurrenceDto })
  occurrence?: OccurrenceDto;
}

export class EventAttachmentDto {
  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  byteSize!: number;
}

export class EventSeriesDto extends RecurrenceRuleDto {
  @ApiProperty()
  timeZone!: string;

  @ApiProperty()
  canEdit!: boolean;
}

export class EventDetailDto extends EventSummaryDto {
  @ApiProperty()
  note!: string;

  @ApiProperty()
  location!: string;

  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ type: EventAttachmentDto, nullable: true })
  attachment!: EventAttachmentDto | null;

  @ApiPropertyOptional({ type: EventSeriesDto })
  series?: EventSeriesDto;

  @ApiPropertyOptional({ description: "How many linked tasks moved with this occurrence change." })
  shiftedTaskCount?: number;
}

export class EventRangeDto {
  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ format: "date" })
  start!: string;

  @ApiProperty({ format: "date" })
  end!: string;

  @ApiProperty({ type: [EventSummaryDto] })
  events!: EventSummaryDto[];
}

export class AttachmentDownloadDto {
  @ApiProperty({ format: "uri" })
  url!: string;
}
