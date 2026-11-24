export type ReminderMinutes = 0 | 15 | 60 | 1440;
export const reminderMinutes: ReminderMinutes[] = [0, 15, 60, 1440];

// Date-only tasks and all-day events count their reminder from 08:00 local time.
export function reminderLabel(minutes: ReminderMinutes, dateOnly: boolean) {
  if (dateOnly) {
    return { 0: "08:00 on the day", 15: "15 minutes before 08:00", 60: "1 hour before 08:00", 1440: "08:00 the day before" }[minutes];
  }
  return { 0: "At the time", 15: "15 minutes before", 60: "1 hour before", 1440: "1 day before" }[minutes];
}

export function defaultTaskReminder(dueDate: string, dueTime: string): ReminderMinutes | null {
  if (!dueDate) return null;
  return dueTime ? 60 : 0;
}

export function parseReminder(value: string): ReminderMinutes | null {
  return value === "" ? null : Number(value) as ReminderMinutes;
}
