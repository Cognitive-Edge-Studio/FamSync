import { ApiProperty } from "@nestjs/swagger";

export const familyBaseNodeKinds = ["person", "task", "goal", "event", "conversation", "file", "memory", "place", "idea"] as const;
export type FamilyBaseNodeKind = (typeof familyBaseNodeKinds)[number];
export const familyBaseRelations = ["assigned", "created", "goal-step", "event", "participant", "shared-in", "linked"] as const;
export type FamilyBaseRelation = (typeof familyBaseRelations)[number];

export class FamilyBaseNodeDto {
  @ApiProperty({ description: "Graph-unique id: kind and record id, such as task:<uuid>." })
  id!: string;

  @ApiProperty({ enum: familyBaseNodeKinds })
  kind!: FamilyBaseNodeKind;

  @ApiProperty({ format: "uuid" })
  recordId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true, description: "Task status, goal status, conversation kind, file type or member role." })
  status!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Due date, target date, event start or upload time (ISO date or date-time)." })
  when!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: "Goal completion percentage when measured." })
  progress!: number | null;

  @ApiProperty({ description: "True for a repeating chore or event." })
  repeats!: boolean;

  @ApiProperty({ type: String, nullable: true, format: "uuid", description: "Folder that holds a file node." })
  folderId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Note on a memory, place or idea." })
  note!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Address or description of a place." })
  location!: string | null;

  @ApiProperty({ description: "True when the caller wrote this memory, place or idea." })
  canEdit!: boolean;

  @ApiProperty({ description: "True for the signed-in member's own person node." })
  you!: boolean;
}

export class FamilyBaseLinkDto {
  @ApiProperty()
  source!: string;

  @ApiProperty()
  target!: string;

  @ApiProperty({ enum: familyBaseRelations })
  relation!: FamilyBaseRelation;
}

export class FamilyBaseGraphDto {
  @ApiProperty()
  familyName!: string;

  @ApiProperty({ type: [FamilyBaseNodeDto] })
  nodes!: FamilyBaseNodeDto[];

  @ApiProperty({ type: [FamilyBaseLinkDto] })
  links!: FamilyBaseLinkDto[];

  @ApiProperty({ enum: familyBaseNodeKinds, isArray: true, description: "Kinds where only the most relevant records are shown." })
  truncated!: FamilyBaseNodeKind[];
}
