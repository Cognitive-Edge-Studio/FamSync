import type { components } from "@famsync/api-client";
import { formatDay } from "./calendar-date";

export type Task = components["schemas"]["TaskDto"];
export type TaskDetail = components["schemas"]["TaskDetailDto"];
export type TaskStatus = Task["status"];
export type TaskSummary = components["schemas"]["TaskSummaryDto"];
export type TaskSeries = components["schemas"]["TaskSeriesDto"];
export type RepeatFrequency = TaskSeries["frequency"];

const repeatUnits: Record<RepeatFrequency, [string, string]> = {
  daily: ["day", "days"], weekly: ["week", "weeks"], monthly: ["month", "months"],
};
const repeatNames: Record<RepeatFrequency, string> = { daily: "daily", weekly: "weekly", monthly: "monthly" };

export function repeatText(rule: { frequency: RepeatFrequency; interval: number; until?: string | null }) {
  const every = rule.interval === 1 ? "Repeats " + repeatNames[rule.frequency]
    : "Repeats every " + rule.interval + " " + repeatUnits[rule.frequency][1];
  return rule.until ? every + " through " + formatDay(rule.until) : every;
}

// Short card label ("Weekly", "Every 2 days"); the full rule stays on the task page and in the badge title.
export function repeatShort(rule: { frequency: RepeatFrequency; interval: number }) {
  const name = repeatNames[rule.frequency];
  return rule.interval === 1 ? name[0].toUpperCase() + name.slice(1) : "Every " + rule.interval + " " + repeatUnits[rule.frequency][1];
}

export function repeatUnit(frequency: RepeatFrequency) {
  return repeatUnits[frequency][1];
}

export const statusLabels: Record<TaskStatus, string> = {
  todo: "To Do", in_progress: "In Progress", completed: "Completed",
};
export const taskStatuses: TaskStatus[] = ["todo", "in_progress", "completed"];

export function tasksPath(familyId: string) {
  return "/tasks/?" + new URLSearchParams({ family: familyId }).toString();
}

export function taskPath(familyId: string, taskId: string) {
  return "/task/?" + new URLSearchParams({ family: familyId, id: taskId }).toString();
}

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: "UTC" });

export function dueText(task: Pick<Task, "dueDate" | "dueTime">, today: string) {
  if (!task.dueDate) return "No due date";
  const day = task.dueDate === today ? "Today" : formatDay(task.dueDate);
  if (!task.dueTime) return "Due " + day;
  return "Due " + day + " at " + timeFormat.format(new Date("1970-01-01T" + task.dueTime + ":00Z"));
}

export function isPastDue(dueDate: string, dueTime: string, today: string, nowMinute: string) {
  if (!dueDate) return false;
  if (dueDate !== today) return dueDate < today;
  return !!dueTime && dueTime <= nowMinute;
}

export type TaskStatusChange = { task: TaskDetail; previous: TaskStatus };

export const statusChangeLabels: Record<TaskStatus, string> = {
  todo: "Moved to To Do", in_progress: "Marked in progress", completed: "Marked complete",
};

// Grouped from the discovery catalog, with the repeated “Behavior goals” entry removed.
export const taskSuggestions: { group: string; titles: string[] }[] = [
  { group: "Household Chores", titles: [
    "Make bed", "Clean room", "Laundry (sort / fold / put away)", "Dishes (load/unload dishwasher)",
    "Take out trash & recycling", "Feed pets / clean litter box", "Vacuum / sweep / mop", "Clean bathroom",
    "Set / clear table", "Yard work (mow, rake, water plants)",
  ] },
  { group: "School & Learning", titles: [
    "Homework (by subject)", "Study / test prep", "Reading time", "Online assignments", "Projects & long-term assignments",
    "Pack backpack / supplies", "Parent-teacher forms", "Tutoring sessions", "Practice spelling/math apps",
  ] },
  { group: "Habits & Daily Routines", titles: [
    "Morning routine", "Evening routine", "Brush teeth (AM/PM)", "Shower / personal hygiene", "Make lunch",
    "Screen-free time", "Gratitude or journaling", "Tidy up before bed",
  ] },
  { group: "Health, Fitness & Wellness", titles: [
    "Sports practice", "Exercise / outdoor play", "Stretching / mobility", "Drink water", "Take vitamins/meds",
    "Mental health check-in", "Bedtime / sleep tracking",
  ] },
  { group: "Personal Responsibility", titles: [
    "Prepare clothes for tomorrow", "Manage allowance", "Track spending/saving", "Care for personal items",
    "Organize backpack/desk", "Respect house rules", "Follow screen-time limits",
  ] },
  { group: "Goals & Skill Building", titles: [
    "Practice instrument", "Learn a new skill", "Reading goals (books/month)", "Chore streak goals", "Fitness milestones",
    "Academic goals", "Behavior goals",
  ] },
  { group: "One-Time / Special Tasks", titles: [
    "Deep clean room", "Help with event prep", "Pack for trip", "Babysit sibling", "Help a neighbor", "Seasonal chores",
    "Special projects",
  ] },
  { group: "Family & Social Commitments", titles: [
    "Family events", "Playdates", "Birthday prep", "Family meetings", "Religious activities", "Volunteer work", "Travel prep",
  ] },
];
