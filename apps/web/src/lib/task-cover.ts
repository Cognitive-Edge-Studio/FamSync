import type { Task } from "./tasks";

// Cover art for board cards, chosen from the task's own words (and its linked event's title). Nothing is saved.
// Only one-off tasks with a recognisable topic get a cover; repeating chores and unmatched tasks stay compact,
// so covers stay occasional, like the reference Kanban.
export type CoverTopic = "trip" | "school" | "health" | "home" | "garden" | "bills" | "celebration" | "activity" | "shopping";

const rules: [CoverTopic, RegExp][] = [
  ["health", /\b(doctor|dentist|orthodont\w*|cardiolog\w*|therap\w*|prescription\w*|pharmacy|medicine|clinic|checkup|check-up|vaccin\w*)\b/i],
  ["trip", /\b(ski|trip|travel|cabin|vacation|holiday|flight|hotel|packing|pack|itinerary|camping)\b/i],
  ["school", /\b(school|homework|teacher|conference|science|permission slip|study|exam|report card|book report|class)\b/i],
  ["celebration", /\b(birthday|cake|party|gift|anniversary|thanksgiving|celebrat\w*|dinner)\b/i],
  ["bills", /\b(pay|bill|bills|utilities|rent|insurance|bank|tax|taxes|invoice|budget)\b/i],
  ["shopping", /\b(grocer\w*|shopping|buy|order|store)\b/i],
  ["garden", /\b(plant\w*|garden\w*|lawn|mow|water the)\b/i],
  ["activity", /\b(soccer|football|practice|piano|lesson|music|swim\w*|game|team)\b/i],
  ["home", /\b(clean\w*|laundry|dishes|vacuum|garage|bins|trash|repair|fix|faucet|plumber)\b/i],
];

export function taskCover(task: Pick<Task, "title" | "description" | "series" | "eventLink">): CoverTopic | null {
  if (task.series) return null;
  const text = [task.title, task.eventLink?.title ?? ""].join(" ");
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
