import { Injectable, Logger } from "@nestjs/common";
import { Temporal } from "@js-temporal/polyfill";
import type { PoolClient } from "pg";
import { DatabaseService } from "./database.service.js";
import { familyTimeZone } from "./family-time-zone.js";
import { InvitationMailService } from "./invitation-mail.service.js";
import { JobsDatabaseService } from "./jobs-database.service.js";
import { notificationPath, notificationText, readNotifications } from "./notifications.store.js";
import type { ChangeNotice } from "./reminder-queue.js";
import { desiredReminders, type DesiredReminder, type SourceKind } from "./reminder-planner.js";
import { isLateForEmail, quietHoursEnd } from "./reminder-rules.js";

const planDays = 14;
const batchSize = 20;
const maxAttempts = 5;

type ReminderRow = {
  id: string;
  familyId: string;
  sourceKind: SourceKind;
  sourceId: string;
  occurrenceKey: string;
  recipientId: string;
  authorId: string;
  remindAt: Date;
  dueAt: Date;
  attempts: number;
};

function asRows(desired: DesiredReminder[]) {
  return JSON.stringify(desired.map((reminder) => ({
    family_id: reminder.familyId, occurrence_key: reminder.occurrenceKey, recipient_id: reminder.recipientId,
    remind_at: reminder.remindAt, due_at: reminder.dueAt,
  })));
}

// Adds planned reminders. A matching reminder cancelled earlier becomes pending again; sent ones stay sent.
async function insertDesired(client: PoolClient, kind: SourceKind, sourceId: string, authorId: string, rows: string) {
  await client.query(`
    insert into app.reminders as r (family_id, source_kind, source_id, occurrence_key, recipient_id, author_id, remind_at, due_at)
    select d.family_id, $1, $2, d.occurrence_key, d.recipient_id, $4, d.remind_at, d.due_at
    from jsonb_to_recordset($3::jsonb) d(family_id uuid, occurrence_key text, recipient_id uuid, remind_at timestamptz, due_at timestamptz)
    on conflict (source_kind, source_id, occurrence_key, recipient_id, remind_at)
    do update set status = 'pending', outcome = null, finished_at = null, due_at = excluded.due_at
    where r.status = 'cancelled'
  `, [kind, sourceId, rows, authorId]);
}

const sameInstant = (a: string | Date, b: string | Date) =>
  Temporal.Instant.compare(Temporal.Instant.from(new Date(a).toISOString()), Temporal.Instant.from(new Date(b).toISOString())) === 0;

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly jobs: JobsDatabaseService,
    private readonly mail: InvitationMailService,
  ) {}

  // Brings a source's pending reminders for the next 14 days in line with its current state.
  // Pending reminders already due are left for delivery, which rechecks them.
  async plan(kind: SourceKind, sourceId: string, authorId: string) {
    const from = Temporal.Now.instant();
    const window = { from, to: from.add({ hours: planDays * 24 }) };
    const desired = await this.database.withActor(authorId, (client) => desiredReminders(client, kind, sourceId, window));
    const rows = asRows(desired);
    await this.jobs.withClient(async (client) => {
      await client.query("begin");
      try {
        await client.query(`
          update app.reminders r set status = 'cancelled', outcome = 'Replanned', finished_at = now()
          where r.source_kind = $1 and r.source_id = $2 and r.status = 'pending' and r.remind_at >= $4::timestamptz
            and not exists (
              select 1 from jsonb_to_recordset($3::jsonb) d(occurrence_key text, recipient_id uuid, remind_at timestamptz)
              where d.occurrence_key = r.occurrence_key and d.recipient_id = r.recipient_id and d.remind_at = r.remind_at
            )
        `, [kind, sourceId, rows, from.toString()]);
        await insertDesired(client, kind, sourceId, authorId, rows);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
    return desired.length;
  }

  // Re-plans every source that has reminders, so long-running series keep a 14-day horizon.
  async planAll() {
    const sources = await this.jobs.withClient(async (client) => (await client.query<{ kind: SourceKind; id: string; author: string }>(
      'select source_kind as kind, source_id as id, author_id as author from app.reminder_sources()',
    )).rows);
    for (const source of sources) {
      try {
        await this.plan(source.kind, source.id, source.author);
      } catch (error) {
        this.logger.warn("Could not plan reminders for " + source.kind + " " + source.id + ": " + String(error));
      }
    }
    return sources.length;
  }

  async deliverDue() {
    let delivered = 0;
    for (;;) {
      const rows = await this.jobs.withClient(async (client) => (await client.query<ReminderRow>(`
        update app.reminders r set status = 'processing', attempts = r.attempts + 1, locked_until = now() + interval '2 minutes'
        where r.id in (
          select id from app.reminders
          where (status = 'pending' and remind_at <= now()) or (status = 'processing' and locked_until < now())
          order by remind_at limit $1 for update skip locked
        )
        returning r.id, r.family_id as "familyId", r.source_kind as "sourceKind", r.source_id as "sourceId",
          r.occurrence_key as "occurrenceKey", r.recipient_id as "recipientId", r.author_id as "authorId",
          r.remind_at as "remindAt", r.due_at as "dueAt", r.attempts
      `, [batchSize])).rows);
      for (const row of rows) {
        await this.deliverOne(row);
        delivered += 1;
      }
      if (rows.length < batchSize) break;
    }
    return delivered;
  }

  private async finish(id: string, status: "sent" | "cancelled" | "failed" | "pending", outcome: string) {
    await this.jobs.withClient((client) => client.query(`
      update app.reminders set status = $2, outcome = $3, locked_until = null,
        finished_at = case when $2 = 'pending' then null else now() end
      where id = $1 and status = 'processing'
    `, [id, status, outcome]));
  }

  private async deliverOne(row: ReminderRow) {
    try {
      // The source must still want this exact reminder, as its author sees it now.
      const remindAt = Temporal.Instant.from(row.remindAt.toISOString());
      const window = { from: remindAt.subtract({ seconds: 1 }), to: remindAt.add({ seconds: 1 }) };
      const current: DesiredReminder[] = await this.database.withActor(row.authorId,
        (client) => desiredReminders(client, row.sourceKind, row.sourceId, window));
      const wanted = current.some((reminder) => reminder.occurrenceKey === row.occurrenceKey
        && reminder.recipientId === row.recipientId && sameInstant(reminder.remindAt, row.remindAt));
      if (!wanted) {
        await this.finish(row.id, "cancelled", "No longer applies");
        // What the item wants at this moment, such as a reminder for the author after the assignee left,
        // is added now so the next pass delivers it.
        if (current.length) {
          await this.jobs.withClient((client) => insertDesired(client, row.sourceKind, row.sourceId, row.authorId, asRows(current)));
        }
        return;
      }

      const recipient = await this.recipientState(row.recipientId, row.familyId, row.sourceKind, row.sourceId);
      if (!recipient) return await this.finish(row.id, "cancelled", "Recipient cannot see the item");
      const late = isLateForEmail(remindAt, Temporal.Now.instant());
      const outcome = await this.notify({
        familyId: row.familyId, recipientId: row.recipientId, kind: "reminder", sourceKind: row.sourceKind, sourceId: row.sourceId,
        occurrenceKey: row.occurrenceKey, dueAt: row.dueAt.toISOString(), key: "reminder:" + row.id,
      }, recipient, recipient.emailReminders && !late);
      await this.finish(row.id, "sent", late && recipient.emailReminders ? "In-app only, too late for email" : outcome);
    } catch (error) {
      const retry = row.attempts < maxAttempts;
      this.logger.warn("Reminder " + row.id + " attempt " + row.attempts + " failed: " + String(error));
      await this.finish(row.id, retry ? "pending" : "failed", String(error).slice(0, 200));
    }
  }

  // As the recipient: whether they can still see the item, their email settings, and the family time zone.
  // Returns undefined when they cannot see the item.
  private async recipientState(recipientId: string, familyId: string, sourceKind: SourceKind, sourceId: string) {
    return this.database.withActor(recipientId, async (client) => {
      const table = sourceKind === "task" ? "app.tasks" : sourceKind === "task_series" ? "app.task_series" : "app.calendar_events";
      const { rows: visible } = await client.query(`select 1 from ${table} where id = $1`, [sourceId]);
      const { rows: [family] } = await client.query<{ timeZone: string }>(
        'select time_zone as "timeZone" from app.families where id = $1', [familyId]);
      if (!visible.length || !family) return undefined;
      const { rows: [preferences] } = await client.query<{
        emailReminders: boolean; emailUpdates: boolean; quietEnabled: boolean; quietStart: string; quietEnd: string;
      }>(`
        select email_reminders as "emailReminders", email_updates as "emailUpdates", quiet_enabled as "quietEnabled",
          to_char(quiet_start, 'HH24:MI') as "quietStart", to_char(quiet_end, 'HH24:MI') as "quietEnd"
        from app.notification_preferences where user_id = app.actor_id()
      `);
      return {
        ...(preferences ?? { emailReminders: true, emailUpdates: false, quietEnabled: true, quietStart: "21:00", quietEnd: "07:00" }),
        timeZone: familyTimeZone(family.timeZone),
      };
    });
  }

  // Writes one in-app notification by key and, when allowed, queues its email after any quiet hours.
  private async notify(notice: {
    familyId: string; recipientId: string; kind: string; sourceKind: SourceKind; sourceId: string; occurrenceKey: string;
    dueAt: string | null; key: string;
  }, recipient: NonNullable<Awaited<ReturnType<RemindersService["recipientState"]>>>, email: boolean) {
    return this.jobs.withClient(async (client) => {
      await client.query(`
        insert into app.notifications (family_id, recipient_id, kind, source_kind, source_id, occurrence_key, due_at, notification_key)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (notification_key) do nothing
      `, [notice.familyId, notice.recipientId, notice.kind, notice.sourceKind, notice.sourceId, notice.occurrenceKey,
        notice.dueAt, notice.key]);
      if (!email) return "In-app";
      const { rows: [created] } = await client.query<{ id: string }>(
        "select id from app.notifications where notification_key = $1", [notice.key]);
      const now = Temporal.Now.instant();
      const waitUntil = quietHoursEnd(now, { enabled: recipient.quietEnabled, start: recipient.quietStart, end: recipient.quietEnd },
        recipient.timeZone);
      await client.query(`
        insert into app.outbox (kind, family_id, payload, dedupe_key, available_at)
        values ('notification.email', $1, $2, $3, $4)
        on conflict (dedupe_key) do nothing
      `, [notice.familyId, { notificationId: created.id, recipientId: notice.recipientId }, "email:" + notice.key,
        (waitUntil ?? now).toString()]);
      return waitUntil ? "In-app; email after quiet hours" : "In-app and email";
    });
  }

  // Delivers an assignment or schedule-change notice to each affected person except the one who made the change.
  async deliverChange(outboxId: string, familyId: string, notice: ChangeNotice) {
    const recipients = notice.occurrenceRecipients
      ? await this.jobs.withClient(async (client) => (await client.query<{ id: string }>(
        "select app.occurrence_change_recipients($1, $2::date) as id", [notice.sourceId, notice.occurrenceKey])).rows.map((row) => row.id))
      : notice.recipientIds ?? [];
    for (const recipientId of new Set(recipients)) {
      if (recipientId === notice.actorId) continue;
      const recipient = await this.recipientState(recipientId, familyId, notice.sourceKind, notice.sourceId);
      if (!recipient) continue;
      await this.notify({
        familyId, recipientId, kind: notice.kind, sourceKind: notice.sourceKind, sourceId: notice.sourceId,
        occurrenceKey: notice.occurrenceKey ?? "", dueAt: notice.dueAt ?? null, key: "change:" + outboxId + ":" + recipientId,
      }, recipient, recipient.emailUpdates);
    }
  }

  // Sends one reminder email, as its recipient, only while they can still see the item.
  async sendEmail(notificationId: string, recipientId: string) {
    const details = await this.database.withActor(recipientId, async (client) => {
      const [notification] = await readNotifications(client, { id: notificationId, limit: 1 });
      if (!notification) return undefined;
      const { rows: [{ email }] } = await client.query<{ email: string | null }>("select app.my_email() as email");
      return email ? { notification, email } : undefined;
    });
    if (!details) return;
    const { notification, email } = details;
    const link = new URL(notificationPath(notification), this.mail.webOrigin()).href;
    const { subject, text } = notificationText(notification);
    const status = await this.mail.deliver({
      to: email, idempotencyKey: notification.notificationKey, subject,
      text: text + " (" + notification.familyName + ").\n\nOpen it in FamSync: " + link,
    });
    if (status === "failed") throw new Error("Notification email delivery failed");
  }
}
