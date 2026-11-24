import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { z } from "zod";
import { dateInput, itemAudiences, type ItemAudience } from "./calendar.dto.js";

export const familyEntryKinds = ["memory", "place", "idea"] as const;
export type FamilyEntryKind = (typeof familyEntryKinds)[number];
export const familyEntryLinkKinds = ["person", "goal", "event", "entry"] as const;
export type FamilyEntryLinkKind = (typeof familyEntryLinkKinds)[number];

const text = (max: number) => z.string().trim().max(max).refine((value) => !value.includes("\0"));
const fields = {
  kind: z.enum(familyEntryKinds), title: text(120).pipe(z.string().min(1)), note: text(2000),
  happenedOn: dateInput.nullable(), location: text(200), audience: z.enum(itemAudiences),
  selectedMemberIds: z.array(z.uuid()).max(100),
  links: z.array(z.strictObject({ kind: z.enum(familyEntryLinkKinds), id: z.uuid() })).max(50),
};
const kindFields = (input: { kind: FamilyEntryKind; happenedOn: string | null; location: string }) =>
  (input.kind === "memory" || input.happenedOn === null) && (input.kind === "place" || input.location === "");
export const createFamilyEntryInput = z.strictObject({ id: z.uuid(), ...fields }).refine(kindFields);
export const updateFamilyEntryInput = z.strictObject({ version: z.int().positive(), ...fields }).refine(kindFields);
export const familyEntryVersionInput = z.strictObject({ version: z.int().positive() });
export type CreateFamilyEntryInput = z.infer<typeof createFamilyEntryInput>;
export type UpdateFamilyEntryInput = z.infer<typeof updateFamilyEntryInput>;

export class FamilyEntryLinkInputDto {
  @ApiProperty({ enum: familyEntryLinkKinds })
  kind!: FamilyEntryLinkKind;

  @ApiProperty({ format: "uuid" })
  id!: string;
}

export class FamilyEntryLinkDto extends FamilyEntryLinkInputDto {
  @ApiProperty()
  name!: string;
}

class FamilyEntryFieldsDto {
  @ApiProperty({ enum: familyEntryKinds })
  kind!: FamilyEntryKind;

  @ApiProperty({ maxLength: 120 })
  title!: string;

  @ApiProperty({ maxLength: 2000 })
  note!: string;

  @ApiProperty({ type: String, format: "date", nullable: true, description: "Memories only." })
  happenedOn!: string | null;

  @ApiProperty({ maxLength: 200, description: "Places only; otherwise empty." })
  location!: string;

  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;

  @ApiProperty({ type: [String], description: "Returned only to the author." })
  selectedMemberIds!: string[];
}

export class UpdateFamilyEntryDto extends FamilyEntryFieldsDto {
  @ApiProperty({ type: [FamilyEntryLinkInputDto] })
  links!: FamilyEntryLinkInputDto[];

  @ApiProperty()
  version!: number;
}

export class CreateFamilyEntryDto extends FamilyEntryFieldsDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ type: [FamilyEntryLinkInputDto] })
  links!: FamilyEntryLinkInputDto[];
}

export class FamilyEntryVersionDto {
  @ApiProperty()
  version!: number;
}

export class FamilyEntryDto extends FamilyEntryFieldsDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  canEdit!: boolean;

  @ApiProperty({ type: [FamilyEntryLinkDto], description: "Links whose target the caller can see." })
  links!: FamilyEntryLinkDto[];
}

export class FamilyEntryDefaultsDto {
  @ApiProperty({ enum: itemAudiences })
  audience!: ItemAudience;
}

export class FamilyEntryDeletedDto {
  @ApiPropertyOptional({ format: "uuid" })
  id!: string;
}
