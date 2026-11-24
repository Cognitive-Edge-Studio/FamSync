import { shiftDay } from "@famsync/core/calendar-date";

// Checks made before a form is sent. The server repeats every one of them and decides who may see an item.
export type Audience = "family" | "selected" | "private";
export type MemberIdentity = { userId: string; firstName: string; lastName: string };

export const memberName = (member: MemberIdentity) => [member.firstName, member.lastName].filter(Boolean).join(" ") || "Family member";

/** People who can see an item with this audience, and so may be assigned to it. */
export function eligibleMembers<T extends MemberIdentity>(members: T[], audience: Audience, selected: string[], me: string) {
  return members.filter((member) => member.userId === me || audience === "family" || (audience === "selected" && selected.includes(member.userId)));
}
export function audienceProblem(audience: Audience, selected: string[]) {
  return audience === "selected" && !selected.length ? "Choose at least one family member." : null;
}

/** Keeps digits only and adds the colon, so a number keypad is enough. */
export function typedTime(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? digits.slice(0, 2) + ":" + digits.slice(2) : digits;
}
export const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export type TaskDraft = {
  title: string; description: string; dueDate: string; dueTime: string; assigneeId: string; audience: Audience; selected: string[];
  remind: string; frequency: "" | "daily" | "weekly" | "monthly"; interval: string; until: string; eventLink: { eventId: string; occurrenceDate: string | null; label: string } | null;
};
export function repeatProblem(draft: Pick<TaskDraft, "dueDate" | "interval" | "until">) {
  const every = Number(draft.interval);
  if (!draft.interval.trim() || !Number.isInteger(every) || every < 1 || every > 365) return "Repeat every 1 to 365.";
  if (!draft.dueDate) return "Choose the first due date.";
  if (draft.until && draft.until < draft.dueDate) return "The repeat end date must be on or after the first due date.";
  return null;
}
export function taskProblem(draft: TaskDraft, kind: "task" | "series", assigneeVisible: boolean, seriesStart?: string) {
  if (!draft.title.trim()) return "Enter a task title.";
  const audience = audienceProblem(draft.audience, draft.selected);
  if (audience) return audience;
  if (draft.assigneeId && !assigneeVisible) return "The assignee can’t see this task with that audience. Choose another assignee or include them.";
  if (draft.dueTime && !validTime(draft.dueTime)) return "Enter the due time as hours and minutes, such as 17:30.";
  if (kind === "series") return draft.until && seriesStart && draft.until < seriesStart ? "The repeat end date must be on or after the first due date." : null;
  if (draft.frequency) return repeatProblem(draft);
  return draft.dueTime && !draft.dueDate ? "Choose a due date for the due time." : null;
}

export type ScheduleDraft = { allDay: boolean; startDate: string; startTime: string; endDate: string; endTime: string };
/** The server's schedule: all-day ends are exclusive, timed ends are wall-clock minutes in the family's time zone. */
export function readSchedule(draft: ScheduleDraft): { schedule: { allDay: boolean; start: string; end: string } } | { problem: string } {
  if (!draft.startDate || !draft.endDate) return { problem: "Choose the start and end dates." };
  if (draft.allDay) {
    if (draft.endDate < draft.startDate) return { problem: "The last day must be on or after the start date." };
    return { schedule: { allDay: true, start: draft.startDate, end: shiftDay(draft.endDate, 1) } };
  }
  if (!validTime(draft.startTime) || !validTime(draft.endTime)) return { problem: "Enter times as hours and minutes, such as 17:30." };
  const start = draft.startDate + "T" + draft.startTime, end = draft.endDate + "T" + draft.endTime;
  return start < end ? { schedule: { allDay: false, start, end } } : { problem: "The end time must follow the start time." };
}

export type GoalDraft = {
  title: string; description: string; type: "family" | "individual"; category: string; priority: "low" | "medium" | "high"; targetDate: string; assigneeId: string;
  audience: Audience; selected: string[]; mode: "manual" | "checklist" | "numeric"; target: string; unit: string;
};
export function amountProblem(value: string, positive: boolean) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()) || (positive && Number(value) <= 0)) return positive ? "Enter a positive target with up to two decimal places." : "Enter a number with up to two decimal places.";
  return Number(value) > 999999999999.99 ? "Enter a smaller number." : null;
}
export function goalProblem(draft: GoalDraft, assigneeVisible: boolean) {
  if (!draft.title.trim()) return "Enter a goal title.";
  const audience = audienceProblem(draft.audience, draft.selected);
  if (audience) return audience;
  if (draft.type === "individual" && !(draft.assigneeId && assigneeVisible)) return "Choose an assignee who can see this goal.";
  if (draft.mode !== "numeric") return null;
  return amountProblem(draft.target, true) ?? (draft.unit.trim() ? null : "Enter a unit.");
}

/** Fields whose saved value differs from the version the person started from, for showing a conflict. */
export function changedFields<T extends Record<string, unknown>>(before: T, latest: T, labels: Partial<Record<keyof T, string>>) {
  return (Object.keys(labels) as (keyof T)[]).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(latest[key])).map((key) => ({ key, label: labels[key]!, value: latest[key] }));
}

/** Keeps the fields the person changed and takes the latest saved value for every other field. */
export function mergeDraft<T extends Record<string, unknown>>(before: T, mine: T, latest: T): T {
  return Object.fromEntries(Object.keys(mine).map((key) => [key, JSON.stringify(mine[key]) === JSON.stringify(before[key]) ? latest[key] : mine[key]])) as T;
}
