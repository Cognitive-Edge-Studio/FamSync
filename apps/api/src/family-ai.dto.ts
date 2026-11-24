import { ApiProperty } from "@nestjs/swagger";
import { z } from "zod";

export const familyAiSettingsInput = z.strictObject({ enabled: z.boolean() });
// Accepting always confirms being an adult; withdrawing needs no confirmation.
export const familyAiConsentInput = z.union([
  z.strictObject({ accepted: z.literal(true), adult: z.literal(true) }),
  z.strictObject({ accepted: z.literal(false), adult: z.boolean() }),
]);
export const familyAiQuestionInput = z.strictObject({
  question: z.string().trim().min(3).max(500).refine((value) => !value.includes("\0")),
});

export class FamilyAiSettingsDto {
  @ApiProperty()
  enabled!: boolean;
}

export class FamilyAiConsentDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiProperty({ description: "The member confirms they are 18 or older. Required to accept." })
  adult!: boolean;
}

export class FamilyAiQuestionDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  question!: string;
}

export class FamilyAiStatusDto {
  @ApiProperty({ description: "True when this server is set up for questions." })
  available!: boolean;

  @ApiProperty({ description: "True when the family owner turned questions on." })
  enabled!: boolean;

  @ApiProperty()
  canManage!: boolean;

  @ApiProperty()
  consented!: boolean;

  @ApiProperty({ description: "Questions the caller can still ask today." })
  remaining!: number;
}

export class FamilyAiAnswerDto {
  @ApiProperty()
  answer!: string;

  @ApiProperty({ type: [String], description: "Family Base node ids the answer relies on." })
  nodeIds!: string[];

  @ApiProperty()
  remaining!: number;
}
