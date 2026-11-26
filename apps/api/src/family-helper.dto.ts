import { ApiProperty } from "@nestjs/swagger";
import { z } from "zod";
import { TaskPersonDto } from "./tasks.dto.js";

const clean = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !value.includes("\0"));

export const saveHelperInput = z.strictObject({ name: clean(1, 40), emoji: clean(1, 16) });
export const helperAskInput = z.strictObject({
  message: clean(1, 2000),
  history: z.array(z.strictObject({ role: z.enum(["user", "model"]), text: z.string().max(4000) })).max(20).default([]),
});
export const helperChannelInput = z.strictObject({ enabled: z.boolean() });
export const helperListItemInput = z.strictObject({ title: clean(1, 120) });
export const helperListDoneInput = z.strictObject({ done: z.boolean() });
export const helperFactInput = z.strictObject({ fact: clean(1, 300), aboutUserId: z.uuid().nullable().optional() });

export class AddFamilyHelperFactDto {
  @ApiProperty({ minLength: 1, maxLength: 300 }) fact!: string;
  @ApiProperty({ format: "uuid", nullable: true, required: false, description: "The member the fact is about, if any." }) aboutUserId?: string | null;
}

export class FamilyHelperDto {
  @ApiProperty() name!: string;
  @ApiProperty() emoji!: string;
}

export class FamilyHelperStatusDto {
  @ApiProperty({ description: "True when this server is set up for AI." }) available!: boolean;
  @ApiProperty({ type: FamilyHelperDto, nullable: true, description: "Null until someone adds a Family Helper." }) helper!: FamilyHelperDto | null;
}

export class SaveFamilyHelperDto {
  @ApiProperty({ minLength: 1, maxLength: 40 }) name!: string;
  @ApiProperty({ minLength: 1, maxLength: 16 }) emoji!: string;
}

export class FamilyHelperTurnDto {
  @ApiProperty({ enum: ["user", "model"] }) role!: "user" | "model";
  @ApiProperty() text!: string;
}

export class FamilyHelperAskDto {
  @ApiProperty({ minLength: 1, maxLength: 2000 }) message!: string;
  @ApiProperty({ type: [FamilyHelperTurnDto], required: false, description: "Earlier turns of this conversation, oldest first." }) history?: FamilyHelperTurnDto[];
}

export class FamilyHelperAnswerDto {
  @ApiProperty() answer!: string;
  @ApiProperty({ type: [String], description: "Names of the actions the helper took, such as add_to_shopping_list." }) actions!: string[];
  @ApiProperty({ type: [String], description: "Up to three short replies the member can tap next." }) suggestions!: string[];
}

export class FamilyHelperChannelDto {
  @ApiProperty() enabled!: boolean;
}

export class FamilyHelperChannelStateDto {
  @ApiProperty() helperEnabled!: boolean;
}

export class FamilyHelperListItemDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: TaskPersonDto, nullable: true }) requestedBy!: TaskPersonDto | null;
  @ApiProperty() addedByHelper!: boolean;
  @ApiProperty() done!: boolean;
  @ApiProperty() createdAt!: string;
}

export class AddFamilyHelperListItemDto {
  @ApiProperty({ minLength: 1, maxLength: 120 }) title!: string;
}

export class SetFamilyHelperListItemDto {
  @ApiProperty() done!: boolean;
}

export class FamilyHelperFactDto {
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty() fact!: string;
  @ApiProperty({ type: TaskPersonDto, nullable: true }) about!: TaskPersonDto | null;
  @ApiProperty() createdAt!: string;
}
