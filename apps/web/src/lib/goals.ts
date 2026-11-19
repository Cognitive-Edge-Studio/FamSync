import type { components } from "@famsync/api-client";

export type Goal = components["schemas"]["GoalDto"];
export type GoalDetail = components["schemas"]["GoalDetailDto"];
export type GoalPage = components["schemas"]["GoalPageDto"];
export type GoalSummary = components["schemas"]["GoalSummaryDto"];
export type GoalDefaults = components["schemas"]["GoalDefaultsDto"];
export const goalTypeLabels = { family: "Family", individual: "Individual" };
export const goalModeLabels = { manual: "Manual", checklist: "Checklist", numeric: "Numeric" };
export const goalPriorityLabels = { low: "Low", medium: "Medium", high: "High" };
const percentageFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function percentageText(value: number | null) {
  return value === null ? "—" : percentageFormat.format(value) + "%";
}
export function goalProgressText(goal: Goal) {
  if (goal.mode === "manual") return goal.status === "completed" ? "Completed" : "Active";
  if (goal.mode === "checklist") {
    const included = goal.itemCount - goal.excludedCount;
    return included ? goal.completedCount + " of " + included + " steps · " + percentageText(goal.percentage)
      : goal.itemCount ? "No active checklist steps" : "No checklist items yet";
  }
  return goal.current + " / " + goal.target + " " + goal.unit + " · " + percentageText(goal.percentage);
}
export function goalsPath(familyId: string) {
  return "/goals/?" + new URLSearchParams({ family: familyId });
}
export function goalPath(familyId: string, id: string) {
  return "/goal/?" + new URLSearchParams({ family: familyId, id });
}
