import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { z } from "zod";
import { dateInput, itemAudiences } from "./calendar.dto.js";
import { TaskPersonDto } from "./tasks.dto.js";

export const goalCategories = [
  "Education & Learning", "Sports & Fitness", "Financial & Savings", "Home & Household",
  "Hobbies & Creativity", "Health & Wellness", "Family & Relationships", "Personal Development",
] as const;
export const goalModes = ["manual", "checklist", "numeric"] as const;
export const goalTypes = ["family", "individual"] as const;
export const goalPriorities = ["low", "medium", "high"] as const;
const text = (max: number) => z.string().trim().max(max).refine((value) => !value.includes("\0"));
const label = text(120).pipe(z.string().min(1));
const amount = z.number().finite().nonnegative().max(999999999999.99).refine(
  (value) => /^\d+(?:\.\d{1,2})?$/.test(String(value)), "Use at most two decimal places.",
);
const detailFields = {
  title: label, description: text(2000), type: z.enum(goalTypes), category: z.enum(goalCategories),
  priority: z.enum(goalPriorities), targetDate: dateInput.nullable().optional(),
  assigneeId: z.uuid().nullable().optional(), audience: z.enum(itemAudiences).optional(),
  selectedMemberIds: z.array(z.uuid()).max(100).optional(),
  target: amount.positive().nullable().optional(), unit: text(40).nullable().optional(),
};
export const createGoalInput = z.strictObject({
  id: z.uuid(), ...detailFields, mode: z.enum(goalModes),
  checklist: z.array(z.strictObject({ id: z.uuid(), label })).max(100).optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalInput>;
export const updateGoalInput = z.strictObject({ ...detailFields, version: z.int().positive(), audience: z.enum(itemAudiences) });
export type UpdateGoalInput = z.infer<typeof updateGoalInput>;
export const goalVersion = z.strictObject({ version: z.int().positive() });
export const goalProgressInput = z.union([
  goalVersion.extend({ completed: z.boolean() }), goalVersion.extend({ current: amount }),
]);
export const goalArchiveInput = goalVersion.extend({ archived: z.boolean() });
export const addGoalItemInput = goalVersion.extend({ id: z.uuid(), label });
export const updateGoalItemInput = goalVersion.extend({ label: label.optional(), completed: z.boolean().optional() })
  .refine((input) => input.label !== undefined || input.completed !== undefined);
export const goalListInput = z.strictObject({
  status: z.enum(["active", "completed"]).optional(), archived: z.enum(["true", "false"]).optional(),
  type: z.enum(goalTypes).optional(), scope: z.enum(["mine", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().max(500).optional(),
});
export type GoalListInput = z.infer<typeof goalListInput>;
export const linkGoalTaskInput = goalVersion.extend({ id: z.uuid(), taskId: z.uuid(), taskVersion: z.int().positive() });
export const linkableTasksInput = z.strictObject({
  q: text(120).optional(), cursor: z.string().max(500).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type LinkableTasksInput = z.infer<typeof linkableTasksInput>;

class GoalFieldsDto {
  @ApiProperty({ maxLength: 120 }) title!: string;
  @ApiProperty({ maxLength: 2000 }) description!: string;
  @ApiProperty({ enum: goalTypes }) type!: "family" | "individual";
  @ApiProperty({ enum: goalCategories }) category!: typeof goalCategories[number];
  @ApiProperty({ enum: goalPriorities }) priority!: "low" | "medium" | "high";
  @ApiPropertyOptional({ type: String, nullable: true, format: "date" }) targetDate?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: "uuid" }) assigneeId?: string | null;
  @ApiPropertyOptional({ enum: itemAudiences }) audience?: typeof itemAudiences[number];
  @ApiPropertyOptional({ type: [String] }) selectedMemberIds?: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) target?: number | null;
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 40 }) unit?: string | null;
}
export class GoalItemInputDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ maxLength: 120 }) label!: string;
}
export class CreateGoalDto extends GoalFieldsDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: goalModes }) mode!: typeof goalModes[number];
  @ApiPropertyOptional({ type: [GoalItemInputDto] }) checklist?: GoalItemInputDto[];
}
export class UpdateGoalDto extends GoalFieldsDto {
  @ApiProperty() version!: number;
}
export class GoalVersionDto {
  @ApiProperty() version!: number;
}
export class LinkGoalTaskDto extends GoalVersionDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "uuid" }) taskId!: string;
  @ApiProperty() taskVersion!: number;
}
export class GoalTaskDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ["todo", "in_progress", "completed"] }) status!: "todo" | "in_progress" | "completed";
  @ApiProperty() archived!: boolean;
}
export class LinkableTaskDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ["todo", "in_progress", "completed"] }) status!: "todo" | "in_progress" | "completed";
  @ApiProperty() version!: number;
  @ApiProperty({ type: String, nullable: true, format: "date" }) dueDate!: string | null;
}
export class LinkableTaskPageDto {
  @ApiProperty({ type: [LinkableTaskDto] }) tasks!: LinkableTaskDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class GoalProgressDto extends GoalVersionDto {
  @ApiPropertyOptional() completed?: boolean;
  @ApiPropertyOptional() current?: number;
}
export class GoalArchiveDto extends GoalVersionDto {
  @ApiProperty() archived!: boolean;
}
export class AddGoalItemDto extends GoalVersionDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ maxLength: 120 }) label!: string;
}
export class UpdateGoalItemDto extends GoalVersionDto {
  @ApiPropertyOptional({ maxLength: 120 }) label?: string;
  @ApiPropertyOptional() completed?: boolean;
}
export class GoalItemDto extends GoalItemInputDto {
  @ApiProperty() completed!: boolean;
  @ApiProperty({ type: GoalTaskDto, nullable: true }) task!: GoalTaskDto | null;
}
export class GoalDto extends GoalFieldsDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ enum: goalModes }) mode!: typeof goalModes[number];
  @ApiProperty({ type: TaskPersonDto }) author!: TaskPersonDto;
  @ApiProperty({ type: TaskPersonDto, nullable: true }) assignee!: TaskPersonDto | null;
  @ApiProperty({ enum: ["active", "completed"] }) status!: "active" | "completed";
  @ApiProperty({ type: Number, nullable: true }) current!: number | null;
  @ApiProperty() itemCount!: number;
  @ApiProperty() completedCount!: number;
  @ApiProperty() excludedCount!: number;
  @ApiProperty({ type: Number, nullable: true }) percentage!: number | null;
  @ApiProperty({ type: String, nullable: true, format: "date-time" }) completedAt!: string | null;
  @ApiProperty() archived!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty() canEdit!: boolean;
  @ApiProperty() canProgress!: boolean;
  @ApiProperty() needsReassignment!: boolean;
  @ApiProperty() pastTarget!: boolean;
}
export class GoalDetailDto extends GoalDto {
  @ApiProperty({ type: [GoalItemDto] }) checklist!: GoalItemDto[];
}
export class GoalPageDto {
  @ApiProperty({ type: [GoalDto] }) goals!: GoalDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ format: "date" }) today!: string;
}
export class GoalSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() archived!: number;
  @ApiProperty({ type: Number, nullable: true }) average!: number | null;
}
export class GoalDefaultsDto {
  @ApiProperty({ enum: itemAudiences }) audience!: typeof itemAudiences[number];
  @ApiProperty({ type: [String] }) categories!: string[];
  @ApiProperty({ type: [String] }) modes!: string[];
  @ApiProperty({ type: [String] }) priorities!: string[];
}
