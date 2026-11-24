import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery, ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { z } from "zod";
import { AuthGuard, type AuthenticatedRequest } from "./auth.guard.js";
import { DatabaseService } from "./database.service.js";
import { notificationPath, notificationText, notificationWhen, readNotifications, countUnreadNotifications, type NotificationKind } from "./notifications.store.js";

const timeInput = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const preferencesInput = z.strictObject({
  emailReminders: z.boolean(),
  emailUpdates: z.boolean(),
  quietEnabled: z.boolean(),
  quietStart: timeInput,
  quietEnd: timeInput,
}).refine((value) => value.quietStart !== value.quietEnd, "Quiet hours need different start and end times.");
const markInput = z.strictObject({ ids: z.array(z.uuid()).max(100).optional() });

export class NotificationDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ["reminder", "assigned", "unassigned", "moved", "cancelled",'message','mention'] })
  kind!: NotificationKind;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true, description: "When the item is due or starts, formatted in its family time zone." })
  when!: string | null;

  @ApiProperty({ description: "A one-line summary, such as “You were assigned Pack kit, due …”." })
  summary!: string;

  @ApiProperty({ enum: ["task", "task_series", "event",'conversation'] })
  sourceKind!: "task" | "task_series" | "event" | 'conversation';

  @ApiProperty({ description: "App path of the item, such as /task/?family=…&id=…" })
  path!: string;

  @ApiProperty()
  familyName!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty()
  read!: boolean;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];

  @ApiProperty()
  unread!: number;
}

export class UnreadCountDto {
  @ApiProperty()
  unread!: number;
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], description: "Notifications to mark read. Omit to mark all read." })
  ids?: string[];
}

export class NotificationPreferencesDto {
  @ApiProperty({ description: "Email reminders in addition to in-app ones." })
  emailReminders!: boolean;

  @ApiProperty({ description: "Email assignment and schedule-change updates." })
  emailUpdates!: boolean;

  @ApiProperty()
  quietEnabled!: boolean;

  @ApiProperty({ description: "HH:MM in the item's family time zone." })
  quietStart!: string;

  @ApiProperty({ description: "HH:MM in the item's family time zone." })
  quietEnd!: string;
}

const preferenceFields = `
  email_reminders as "emailReminders", email_updates as "emailUpdates", quiet_enabled as "quietEnabled",
  to_char(quiet_start, 'HH24:MI') as "quietStart", to_char(quiet_end, 'HH24:MI') as "quietEnd"
`;
const defaults: NotificationPreferencesDto = {
  emailReminders: true, emailUpdates: false, quietEnabled: true, quietStart: "21:00", quietEnd: "07:00",
};

@Controller("api/v1")
@UseGuards(AuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: "The session is missing or invalid." })
export class NotificationsController {
  constructor(private readonly database: DatabaseService) {}

  @Get("notifications")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "listNotifications" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "id", required: false, type: String, description: "Resolve one notification with current access checks." })
  @ApiOkResponse({ type: NotificationListDto })
  list(@Req() { actorId }: AuthenticatedRequest, @Query("limit") limit?: string, @Query("id") id?: string): Promise<NotificationListDto> {
    const size = limit === undefined ? 50 : Number(limit);
    if (!Number.isInteger(size) || size < 1 || size > 100) throw new BadRequestException("Choose a limit from 1 to 100.");
    if (id !== undefined && !z.uuid().safeParse(id).success) throw new BadRequestException("Choose a notification.");
    return this.database.withActor(actorId, async (client) => {
      const rows = await readNotifications(client, { limit: size, id });
      return {
        items: rows.map((row) => ({
          id: row.id, kind: row.kind, title: row.title, when: notificationWhen(row), summary: notificationText(row).text,
          sourceKind: row.sourceKind,
          path: notificationPath(row), familyName: row.familyName, createdAt: row.createdAt.toISOString(), read: row.readAt !== null,
        })),
        unread: await this.unreadVisible(client),
      };
    });
  }

  @Get("notifications/unread-count")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "countUnreadNotifications" })
  @ApiOkResponse({ type: UnreadCountDto })
  unread(@Req() { actorId }: AuthenticatedRequest) {
    return this.database.withActor(actorId, async (client) => ({ unread: await this.unreadVisible(client) }));
  }

  @Post("notifications/read")
  @HttpCode(200)
  @ApiOperation({ operationId: "markNotificationsRead" })
  @ApiOkResponse({ type: UnreadCountDto })
  markRead(@Req() { actorId }: AuthenticatedRequest, @Body() body: MarkReadDto) {
    const input = markInput.safeParse(body ?? {});
    if (!input.success) throw new BadRequestException("Choose notifications to mark read.");
    return this.database.withActor(actorId, async (client) => {
      await client.query(`
        update app.notifications set read_at = now()
        where recipient_id = app.actor_id() and read_at is null and ($1::uuid[] is null or id = any($1::uuid[]))
      `, [input.data.ids ?? null]);
      await client.query(`update app.conversation_alerts set read_at=now() where recipient_id=app.actor_id()
        and read_at is null and ($1::uuid[] is null or id=any($1::uuid[]))`,[input.data.ids??null]);
      return { unread: await this.unreadVisible(client) };
    });
  }

  @Get("account/notification-preferences")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ operationId: "getNotificationPreferences" })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  preferences(@Req() { actorId }: AuthenticatedRequest) {
    return this.database.withActor(actorId, async (client) => {
      const { rows: [row] } = await client.query<NotificationPreferencesDto>(
        `select ${preferenceFields} from app.notification_preferences where user_id = app.actor_id()`);
      return row ?? defaults;
    });
  }

  @Put("account/notification-preferences")
  @ApiOperation({ operationId: "updateNotificationPreferences" })
  @ApiOkResponse({ type: NotificationPreferencesDto })
  savePreferences(@Req() { actorId }: AuthenticatedRequest, @Body() body: NotificationPreferencesDto) {
    const input = preferencesInput.safeParse(body);
    if (!input.success) throw new BadRequestException("Check the notification settings. Quiet hours need different start and end times.");
    const value = input.data;
    return this.database.withActor(actorId, async (client) => {
      const { rows: [row] } = await client.query<NotificationPreferencesDto>(`
        insert into app.notification_preferences (user_id, email_reminders, email_updates, quiet_enabled, quiet_start, quiet_end)
        values (app.actor_id(), $1, $2, $3, $4::time, $5::time)
        on conflict (user_id) do update set email_reminders = excluded.email_reminders, email_updates = excluded.email_updates,
          quiet_enabled = excluded.quiet_enabled, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end
        returning ${preferenceFields}
      `, [value.emailReminders, value.emailUpdates, value.quietEnabled, value.quietStart, value.quietEnd]);
      return row;
    });
  }

  // Counts unread entries the caller can still see, matching what the inbox shows.
  private async unreadVisible(client: Parameters<Parameters<DatabaseService["withActor"]>[1]>[0]) {
    return countUnreadNotifications(client);
  }
}
