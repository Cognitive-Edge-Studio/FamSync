import { ModuleIcon } from "./ui/module-icon";
import { CalendarClock, Check, Flag } from "lucide-react";
import { audienceLabels, formatDay } from "@/lib/calendar-date";
import { goalPath, goalPriorityLabels, goalProgressText, goalTypeLabels, type Goal } from "@/lib/goals";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { Badge, type BadgeTone } from "./ui/badge";
import { GoalProgressBar } from "./ui/progress-bar";

const priorityTones: Record<Goal["priority"], BadgeTone> = { high: "rose", medium: "peach", low: "sky" };
export const categoryTones: Record<string, "sage" | "peach" | "lavender" | "sky" | "rose"> = {
  "Education & Learning": "sky", "Sports & Fitness": "sage", "Financial & Savings": "peach", "Home & Household": "peach",
  "Hobbies & Creativity": "lavender", "Health & Wellness": "sage", "Family & Relationships": "rose", "Personal Development": "lavender",
};
const tileClass = { sage: "bg-sage text-sage-foreground", peach: "bg-peach text-peach-foreground", lavender: "bg-lavender text-lavender-foreground", sky: "bg-sky text-sky-foreground", rose: "bg-rose text-rose-foreground" };

// Goal card: a soft category tile, badges, progress and the target date and owner in a divided footer.
export function GoalCard({ goal, familyId }: { goal: Goal; familyId: string }) {
  const tone = categoryTones[goal.category] ?? "lavender";
  const done = goal.status === "completed";
  return (
    <a href={goalPath(familyId, goal.id)} className="grid h-full min-w-0 content-start gap-3 rounded-2xl border border-border bg-panel p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", done ? tileClass.sage : tileClass[tone])}>
          {done ? <Check className="size-5" aria-hidden="true" /> : <ModuleIcon name="goals" className="size-5" />}
        </span>
        <div className="min-w-0 grow">
          <h3 className="font-semibold wrap-anywhere">{goal.title}</h3>
          <p className="truncate text-xs text-muted-foreground">{goal.category} · {goal.audience && audienceLabels[goal.audience]}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="outline">{goalTypeLabels[goal.type]}</Badge>
        <Badge tone={priorityTones[goal.priority]}>{goalPriorityLabels[goal.priority]} priority</Badge>
        {done && <Badge tone="sage">Completed</Badge>}
      </div>
      <div className="grid gap-1.5">
        <p className="text-sm font-medium">{goalProgressText(goal)}</p>
        {goal.percentage !== null && <GoalProgressBar value={goal.percentage} tone={done ? "sage" : tone} />}
      </div>
      {(goal.targetDate || goal.type === "individual") && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
          {goal.targetDate ? (
            <span className={cn("inline-flex items-center gap-1.5", goal.pastTarget ? "text-destructive" : "text-muted-foreground")}>
              <CalendarClock aria-hidden="true" className="size-3.5" />{goal.pastTarget ? "Past target date · " : "Target · "}{formatDay(goal.targetDate)}
            </span>
          ) : <span />}
          {goal.type === "individual" && (goal.needsReassignment
            ? <Badge tone="rose">Needs reassignment</Badge>
            : goal.assignee && <span className="inline-flex min-w-0 items-center gap-1.5"><Avatar name={goal.assignee.name} colorKey={goal.assignee.userId} size="sm" /><span className="truncate">{goal.assignee.name}</span></span>)}
        </div>
      )}
    </a>
  );
}
