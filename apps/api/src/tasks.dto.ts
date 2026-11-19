import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { z } from "zod";
import { dateInput, itemAudiences, type ItemAudience } from "./calendar.dto.js";
import { taskStatuses, type TaskStatus } from "./task-rules.js";

const text = (max: number) => z.string().trim().max(max).refine((value) => !value.includes("\0"));
const timeInput = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const eventLinkInput = z.strictObject({ eventId: z.uuid(), occurrenceDate: dateInput.nullable().optional() });
export type EventLinkInput = z.infer<typeof eventLinkInput>;
const detailFields = {
  title: text(120).pipe(z.string().min(1)),
  description: text(2000),
  dueDate: dateInput.nullable().optional(),
  dueTime: timeInput.nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
  audience: z.enum(itemAudiences).optional(),
  selectedMemberIds: z.array(z.uuid()).max(100).optional(),
  eventLink: eventLinkInput.nullable().optional(),
  remindMinutes: z.union([z.literal(0), z.literal(15), z.literal(60), z.literal(1440)]).nullable().optional(),
};
export const createTaskInput = z.strictObject({ id: z.uuid(), ...detailFields });
export type CreateTaskInput = z.infer<typeof createTaskInput>;
export const updateTaskInput = z.strictObject({
  ...detailFields, audience: z.enum(itemAudiences), version: z.int().min(1),
});
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;
export const taskStatusInput = z.strictObject({ status: z.enum(taskStatuses), version: z.int().min(1) });
export type TaskStatusInput = z.infer<typeof taskStatusInput>;
export const archiveInput = z.strictObject({ archived: z.boolean(), version: z.int().min(1) });
export type ArchiveInput = z.infer<typeof archiveInput>;

const repeatRule = z.strictObject({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.int().min(1).max(365),
  until: dateInput.nullable().optional(),
});
export type RepeatRule = z.infer<typeof repeatRule>;
const seriesFields = {
  title: detailFields.title,
  description: detailFields.description,
  dueTime: detailFields.dueTime,
  assigneeId: detailFields.assigneeId,
  selectedMemberIds: detailFields.selectedMemberIds,
  remindMinutes: detailFields.remindMinutes,
};
export const seriesPreviewInput = z.strictObject({ startDate: dateInput, recurrence: repeatRule });
export type SeriesPreviewInput = z.infer<typeof seriesPreviewInput>;
export const createSeriesInput = z.strictObject({
  id: z.uuid(), ...seriesFields, audience: z.enum(itemAudiences).optional(), startDate: dateInput, recurrence: repeatRule,
});
export type CreateSeriesInput = z.infer<typeof createSeriesInput>;
export const updateSeriesInput = z.strictObject({
  ...seriesFields, audience: z.enum(itemAudiences), until: dateInput.nullable().optional(), version: z.int().min(1),
});
export type UpdateSeriesInput = z.infer<typeof updateSeriesInput>;

export const taskListQuery = z.strictObject({
  archived: z.enum(["true", "false"]).optional(),
  status: z.enum(taskStatuses).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  due: z.literal("today").optional(),
  scope: z.enum(["all", "mine"]).optional(),
  event: z.uuid().optional(),
  occurrence: dateInput.optional(),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuery>;

class TaskFieldsDto {
  @ApiProperty({ maxLength: 120 })
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  description!: string;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true, description: "Due date in the family time zone." })
  dueDate?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Optional due time as HH:MM in the family time zone." })
  dueTime?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  assigneeId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  selectedMemberIds?: string[];

  @ApiPropertyOptional({ type: () => EventLinkDto, nullable: true, description: "Link to an event or one of its occurrences." })
  eventLink?: EventLinkDto | null;

  @ApiPropertyOptional({ type: Number, nullable: true, enum: [0, 15, 60, 1440],
    description: "Minutes before the due time. Date-only items count from 08:00. Null turns the reminder off." })
  remindMinutes?: 0 | 15 | 60 | 1440 | null;
}

export class EventLinkDto {
  @ApiProperty({ format: "uuid" })
  eventId!: string;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true, description: "Original date of a repeating event's occurrence." })
  occurrenceDate?: string | null;
}

export class TaskEventLinkDto extends EventLinkDto {
  @ApiProperty()
  title!: string;

  @ApiProperty({ description: "True when the linked occurrence was cancelled." })
  cancelled!: boolean;
}

export class CreateTaskDto extends TaskFieldsDto {
  @ApiProperty({ format: "uuid", description: "A client-generated ID reused when retrying the same save." })
  id!: string;

  @ApiPropertyOptional({ enum: itemAudiences })
  audience?: ItemAudience;
}

export class UpdateTaskDto extends TaskFieldsDto {
  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;

  @ApiProperty({ description: "The task version this edit is based on." })
  version!: number;
}

export class TaskStatusDto {
  @ApiProperty({ enum: taskStatuses })
  status!: TaskStatus;

  @ApiProperty({ description: "The task version this change is based on." })
  version!: number;
}

export class ArchiveDto {
  @ApiProperty()
  archived!: boolean;

  @ApiProperty({ description: "The version this change is based on." })
  version!: number;
}

export class RepeatRuleDto {
  @ApiProperty({ enum: ["daily", "weekly", "monthly"] })
  frequency!: RepeatRule["frequency"];

  @ApiProperty({ minimum: 1, maximum: 365 })
  interval!: number;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true, description: "Inclusive last due date. Omit to repeat with no end." })
  until?: string | null;
}

export class SeriesPreviewInputDto {
  @ApiProperty({ format: "date", description: "The first due date in the family time zone." })
  startDate!: string;

  @ApiProperty({ type: RepeatRuleDto })
  recurrence!: RepeatRuleDto;
}

export class SeriesPreviewDto {
  @ApiProperty({ type: [String], description: "The first due dates of the series." })
  dates!: string[];

  @ApiProperty()
  hasMore!: boolean;
}

class SeriesFieldsDto {
  @ApiPropertyOptional({ type: Number, nullable: true, enum: [0, 15, 60, 1440],
    description: "Minutes before the due time. Date-only items count from 08:00. Null turns the reminder off." })
  remindMinutes?: 0 | 15 | 60 | 1440 | null;

  @ApiProperty({ maxLength: 120 })
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  description!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: "Optional due time as HH:MM in the family time zone." })
  dueTime?: string | null;

  @ApiPropertyOptional({ type: String, format: "uuid", nullable: true })
  assigneeId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  selectedMemberIds?: string[];
}

export class CreateSeriesDto extends SeriesFieldsDto {
  @ApiProperty({ format: "uuid", description: "A client-generated ID reused when retrying the same save." })
  id!: string;

  @ApiPropertyOptional({ enum: itemAudiences })
  audience?: ItemAudience;

  @ApiProperty({ format: "date" })
  startDate!: string;

  @ApiProperty({ type: RepeatRuleDto })
  recurrence!: RepeatRuleDto;
}

export class UpdateSeriesDto extends SeriesFieldsDto {
  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;

  @ApiPropertyOptional({ type: String, format: "date", nullable: true })
  until?: string | null;

  @ApiProperty({ description: "The series version this edit is based on." })
  version!: number;
}

export class TaskSeriesInfoDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["daily", "weekly", "monthly"] })
  frequency!: RepeatRule["frequency"];

  @ApiProperty()
  interval!: number;

  @ApiProperty({ type: String, format: "date", nullable: true })
  until!: string | null;

  @ApiProperty({ format: "date" })
  occurrenceDate!: string;

  @ApiProperty()
  archived!: boolean;
}

export class TaskPersonDto {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "False when the person is no longer a family member." })
  current!: boolean;
}

export class TaskDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: taskStatuses })
  status!: TaskStatus;

  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;

  @ApiProperty({ type: [String], description: "Selected recipients. Only returned to the author." })
  selectedMemberIds!: string[];

  @ApiProperty({ type: String, format: "date", nullable: true })
  dueDate!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "HH:MM in the family time zone." })
  dueTime!: string | null;

  @ApiProperty()
  overdue!: boolean;

  @ApiProperty({ type: TaskPersonDto })
  author!: TaskPersonDto;

  @ApiProperty({ type: TaskPersonDto, nullable: true })
  assignee!: TaskPersonDto | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  completedAt!: string | null;

  @ApiProperty({ type: TaskPersonDto, nullable: true })
  completedBy!: TaskPersonDto | null;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  canEdit!: boolean;

  @ApiProperty()
  canChangeStatus!: boolean;

  @ApiProperty({ type: TaskSeriesInfoDto, nullable: true, description: "Set when the task is one occurrence of a chore." })
  series!: TaskSeriesInfoDto | null;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty({ description: "True when this occurrence was edited on its own, so series edits leave it unchanged." })
  customized!: boolean;

  @ApiProperty({ type: TaskEventLinkDto, nullable: true, description: "Only set when the viewer can see the linked event." })
  eventLink!: TaskEventLinkDto | null;

  @ApiProperty({ type: Number, nullable: true, description: "Reminder minutes before the due time, or null for none." })
  remindMinutes!: number | null;
}

export class TaskSeriesDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;

  @ApiProperty({ type: [String], description: "Selected recipients. Only returned to the author." })
  selectedMemberIds!: string[];

  @ApiProperty({ type: TaskPersonDto })
  author!: TaskPersonDto;

  @ApiProperty({ type: TaskPersonDto, nullable: true })
  assignee!: TaskPersonDto | null;

  @ApiProperty({ type: String, nullable: true })
  dueTime!: string | null;

  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ enum: ["daily", "weekly", "monthly"] })
  frequency!: RepeatRule["frequency"];

  @ApiProperty()
  interval!: number;

  @ApiProperty({ format: "date" })
  startDate!: string;

  @ApiProperty({ type: String, format: "date", nullable: true })
  until!: string | null;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  canEdit!: boolean;

  @ApiProperty({ type: [String], description: "The next due dates after today, up to eight." })
  upcoming!: string[];

  @ApiProperty({ type: Number, nullable: true })
  remindMinutes!: number | null;

  @ApiProperty({ format: "date" })
  today!: string;
}

export class TaskDetailDto extends TaskDto {
  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ format: "date" })
  today!: string;
}

export class TaskPageDto {
  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ format: "date" })
  today!: string;

  @ApiProperty({ type: [TaskDto] })
  tasks!: TaskDto[];

  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}

export class TaskSummaryDto {
  @ApiProperty()
  timeZone!: string;

  @ApiProperty({ format: "date" })
  today!: string;

  @ApiProperty()
  all!: number;

  @ApiProperty()
  overdue!: number;

  @ApiProperty()
  todo!: number;

  @ApiProperty()
  inProgress!: number;

  @ApiProperty()
  completed!: number;

  @ApiProperty({ description: "Unfinished tasks due today." })
  dueToday!: number;

  @ApiProperty({ description: "Archived tasks. Every other count excludes them." })
  archived!: number;
}

export class TaskDefaultsDto {
  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;
}
