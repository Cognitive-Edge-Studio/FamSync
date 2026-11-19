import { Temporal } from "@js-temporal/polyfill";
import { BadRequestException } from "@nestjs/common";

export const taskStatuses = ["todo", "in_progress", "completed"] as const;
export type TaskStatus = typeof taskStatuses[number];
export type TaskDue = { dueDate: string | null; dueAt: string | null };
export type TaskClock = { now: string; today: string };

export function taskClock(timeZone: string, now = Temporal.Now.instant()): TaskClock {
  return { now: now.toString(), today: now.toZonedDateTimeISO(timeZone).toPlainDate().toString() };
}

// Matches overdueSql. A date-only task is overdue once its due day has ended in the family time zone.
export function isOverdue(task: TaskDue & { status: TaskStatus }, clock: TaskClock) {
  if (task.status === "completed" || !task.dueDate) return false;
  if (task.dueAt) return Temporal.Instant.compare(task.dueAt, clock.now) < 0;
  return Temporal.PlainDate.compare(task.dueDate, clock.today) < 0;
}

export const overdueSql = (now: string, today: string) => `(t.status <> 'completed' and (
  (t.due_at is not null and t.due_at < ${now})
  or (t.due_at is null and t.due_date < ${today})
))`;

export function taskDue(dueDate: string | undefined | null, dueTime: string | undefined | null, timeZone: string): TaskDue {
  if (!dueDate) {
    if (dueTime) throw new BadRequestException("Choose a due date for the due time.");
    return { dueDate: null, dueAt: null };
  }
  if (!dueTime) return { dueDate, dueAt: null };
  try {
    const local = Temporal.PlainDateTime.from(dueDate + "T" + dueTime);
    const dueAt = local.toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant();
    return { dueDate, dueAt: dueAt.toString() };
  } catch {
    throw new BadRequestException("Choose a valid due time in the family time zone. Some times repeat or skip when clocks change.");
  }
}

export function localDueTime(dueAt: string | null, timeZone: string) {
  if (!dueAt) return null;
  return Temporal.Instant.from(dueAt).toZonedDateTimeISO(timeZone).toPlainTime().toString({ smallestUnit: "minute" });
}

export type TaskCursor = [dueDate: string, dueAt: string, createdAt: string, id: string];

export function encodeCursor(cursor: TaskCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string): TaskCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (Array.isArray(parsed) && parsed.length === 4 && parsed.every((part) => typeof part === "string" && part.length <= 64)) {
      return parsed as TaskCursor;
    }
  } catch {
    // Fall through to the validation error.
  }
  throw new BadRequestException("The page cursor is invalid. Reload the list.");
}
