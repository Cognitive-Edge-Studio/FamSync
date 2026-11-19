import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SourceKind } from "./reminder-planner.js";

// Queues a reminder re-plan in the caller's transaction. Re-plans are idempotent, so each change queues its own.
export async function queueReminderPlan(client: PoolClient, familyId: string, sourceKind: SourceKind, sourceId: string, authorId: string) {
  await client.query(
    "insert into app.outbox (kind, family_id, payload, dedupe_key) values ('reminders.plan', $1, $2, $3)",
    [familyId, { sourceKind, sourceId, authorId }, "plan:" + randomUUID()],
  );
}

export type ChangeNotice = {
  kind: "assigned" | "unassigned" | "moved" | "cancelled";
  sourceKind: SourceKind;
  sourceId: string;
  occurrenceKey?: string;
  // Named recipients, or everyone affected by an event occurrence change, resolved when the job runs.
  recipientIds?: string[];
  occurrenceRecipients?: boolean;
  // The person who made the change. They are never notified about it.
  actorId: string;
  dueAt?: string | null;
};

// Queues a change notification in the caller's transaction, so it exists only if the change commits.
export async function queueChangeNotice(client: PoolClient, familyId: string, notice: ChangeNotice) {
  await client.query(
    "insert into app.outbox (kind, family_id, payload, dedupe_key) values ('notification.change', $1, $2, $3)",
    [familyId, notice, "change:" + randomUUID()],
  );
}
