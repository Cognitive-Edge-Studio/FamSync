import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { z } from "zod";
import { familyAiConsentInput, familyAiSettingsInput } from "./family-ai.dto.js";

export const familyVoiceSettingsInput = familyAiSettingsInput;
export const familyVoiceConsentInput = familyAiConsentInput;
/** Earlier words of this call, kept only by the caller's own screen. */
export const familyVoiceTurnsInput = z.array(z.strictObject({ you: z.string().max(500), reply: z.string().max(1200) })).max(6);

export class FamilyVoiceStatusDto {
  @ApiProperty({ description: "True when this server is set up for voice." })
  available!: boolean;
  @ApiProperty({ description: "True when the family owner turned voice on." })
  enabled!: boolean;
  @ApiProperty()
  canManage!: boolean;
  @ApiProperty()
  consented!: boolean;
  @ApiProperty({ description: "Seconds the caller can still use today." })
  remainingSeconds!: number;
}
export class FamilyVoiceTurnDto {
  @ApiProperty({ type: "string", format: "binary", description: "MP4 or WebM audio up to 2 MB." })
  file!: string;
  @ApiPropertyOptional({ description: "JSON list of earlier turns in this call: [{you, reply}], at most six." })
  turns?: string;
}
export class FamilyVoiceReplyDto {
  @ApiProperty()
  heard!: string;
  @ApiProperty()
  answer!: string;
  @ApiProperty({ type: [String] })
  nodeIds!: string[];
  @ApiProperty({ type: String, nullable: true, description: "MP3 as base64, or null when the answer could not be spoken." })
  audio!: string | null;
  @ApiProperty()
  remainingSeconds!: number;
}
