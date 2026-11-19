import { BadRequestException, Body, Controller, Get, Header, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { DatabaseService } from "./database.service.js";

const audiences = ["family", "selected", "private"] as const;
const audience = z.enum(audiences);
const input = z.strictObject({
  privateMode: z.boolean(),
  calendar: audience,
  tasks: audience,
  goals: audience,
});

class PrivacyPreferencesDto {
  @ApiProperty()
  privateMode!: boolean;

  @ApiProperty({ enum: audiences })
  calendar!: z.infer<typeof audience>;

  @ApiProperty({ enum: audiences })
  tasks!: z.infer<typeof audience>;

  @ApiProperty({ enum: audiences })
  goals!: z.infer<typeof audience>;
}

@Controller("api/v1/me/privacy")
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "The session is missing or invalid." })
export class PrivacyController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getMyPrivacyPreferences" })
  @ApiOkResponse({ type: PrivacyPreferencesDto })
  get(@Req() { actorId }: AuthenticatedRequest) {
    return this.database.withActor(actorId, async (client) => {
      const { rows } = await client.query<PrivacyPreferencesDto>(`
        select private_mode as "privateMode", calendar, tasks, goals
        from app.privacy_preferences where user_id = $1
      `, [actorId]);
      return rows[0] ?? { privateMode: false, calendar: "family", tasks: "family", goals: "family" };
    });
  }

  @Put()
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "replaceMyPrivacyPreferences" })
  @ApiOkResponse({ type: PrivacyPreferencesDto })
  put(@Req() { actorId }: AuthenticatedRequest, @Body() body: PrivacyPreferencesDto) {
    const result = input.safeParse(body);
    if (!result.success) throw new BadRequestException("Choose a valid audience for each section.");
    const { privateMode, calendar, tasks, goals } = result.data;
    return this.database.withActor(actorId, async (client) => {
      const { rows: [updated] } = await client.query<PrivacyPreferencesDto>(`
        insert into app.privacy_preferences (user_id, private_mode, calendar, tasks, goals)
        values ($1, $2, $3, $4, $5)
        on conflict (user_id) do update set private_mode = excluded.private_mode, calendar = excluded.calendar,
          tasks = excluded.tasks, goals = excluded.goals
        returning private_mode as "privateMode", calendar, tasks, goals
      `, [actorId, privateMode, calendar, tasks, goals]);
      return updated;
    });
  }
}
