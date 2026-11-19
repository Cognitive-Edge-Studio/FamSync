import { BadRequestException, Body, Controller, Get, Header, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { DatabaseService } from "./database.service.js";
import { generateOccurrences } from "./task-series.store.js";
import { familyTimeZone } from "./family-time-zone.js";
import { taskClock } from "./task-rules.js";

const profileSchema = z.strictObject({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
  bio: z.string().trim().max(500),
});

class ProfileActivityDto {
  @ApiProperty() activeTasks!: number;
  @ApiProperty() completedTasks!: number;
  @ApiProperty() activeGoals!: number;
  @ApiProperty() completedGoals!: number;
}

class ProfileInputDto {
  @ApiProperty({ maxLength: 80 })
  firstName!: string;

  @ApiProperty({ maxLength: 80 })
  lastName!: string;

  @ApiProperty({ maxLength: 500 })
  bio!: string;
}

class ProfileDto extends ProfileInputDto {
  @ApiProperty({ format: "uuid" })
  userId!: string;
}

@Controller("api/v1/me/profile")
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "The session is missing or invalid." })
export class ProfileController {
  constructor(private readonly database: DatabaseService) {}

  @Get("activity")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getMyProfileActivity" })
  @ApiOkResponse({ type: ProfileActivityDto })
  async activity(@Req() { actorId }: AuthenticatedRequest): Promise<ProfileActivityDto> {
    return this.database.withActor(actorId, async (client) => {
      const { rows: families } = await client.query<{ id: string; zone: string }>(
        'select id, time_zone as zone from app.families order by id');
      for (const family of families) await generateOccurrences(client, family.id, taskClock(familyTimeZone(family.zone)).today);
      const { rows: [activity] } = await client.query<ProfileActivityDto>(`
        select * from (
          select count(*) filter (where status <> 'completed')::int as "activeTasks",
            count(*) filter (where status = 'completed')::int as "completedTasks" from app.tasks
          where archived_at is null and (assignee_id = $1 or (assignee_id is null and author_id = $1))
        ) tasks cross join (
          select count(*) filter (where completed_at is null)::int as "activeGoals",
            count(*) filter (where completed_at is not null)::int as "completedGoals" from app.goals
          where archived_at is null and (author_id = $1 or assignee_id = $1)
        ) goals`, [actorId]);
      return activity;
    });
  }

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getMyProfile" })
  @ApiOkResponse({ type: ProfileDto })
  async getProfile(@Req() { actorId }: AuthenticatedRequest): Promise<ProfileDto> {
    return this.database.withActor(actorId, async (client) => {
      const { rows } = await client.query<ProfileDto>(`
        select user_id as "userId", first_name as "firstName", last_name as "lastName", bio
        from app.profiles where user_id = $1
      `, [actorId]);
      return rows[0] ?? { userId: actorId, firstName: "", lastName: "", bio: "" };
    });
  }

  @Put()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "replaceMyProfile" })
  @ApiOkResponse({ type: ProfileDto })
  async updateProfile(
    @Req() { actorId }: AuthenticatedRequest,
    @Body() input: ProfileInputDto,
  ): Promise<ProfileDto> {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException("Enter names up to 80 characters and a bio up to 500 characters.");
    }

    const { firstName, lastName, bio } = parsed.data;
    return this.database.withActor(actorId, async (client) => {
      const { rows: [profile] } = await client.query<ProfileDto>(`
        insert into app.profiles (user_id, first_name, last_name, bio)
        values ($1, $2, $3, $4)
        on conflict (user_id) do update set
          first_name = excluded.first_name, last_name = excluded.last_name,
          bio = excluded.bio, updated_at = now()
        returning user_id as "userId", first_name as "firstName", last_name as "lastName", bio
      `, [actorId, firstName, lastName, bio]);
      return profile;
    });
  }
}
