import { ApiProperty } from "@nestjs/swagger";
import { z } from "zod";

export const familyInput = z.strictObject({
  name: z.string().trim().min(1).max(100).refine((name) => !name.includes("\0")),
  timeZone: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_+\/-]+$/),
});
export const inviteInput = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});
export const acceptInput = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export class FamilyInputDto {
  @ApiProperty({ maxLength: 100 })
  name!: string;

  @ApiProperty({ example: "Asia/Dhaka" })
  timeZone!: string;
}

export class FamilyDto extends FamilyInputDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["owner", "member"] })
  role!: "owner" | "member";
}

export class FamilyMemberDto {
  @ApiProperty({ format: "uuid" })
  userId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ type: String, format: "email", nullable: true })
  email!: string | null;

  @ApiProperty({ enum: ["owner", "member"] })
  role!: FamilyDto["role"];
}

export class InviteInputDto {
  @ApiProperty({ format: "email", maxLength: 254 })
  email!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ minLength: 43, maxLength: 43 })
  token!: string;
}

export class InvitationDto extends InviteInputDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["pending", "accepted", "expired", "revoked"] })
  status!: "pending" | "accepted" | "expired" | "revoked";

  @ApiProperty({ enum: ["pending", "sent", "failed"] })
  deliveryStatus!: "pending" | "sent" | "failed";

  @ApiProperty({ format: "date-time" })
  expiresAt!: string;
}
