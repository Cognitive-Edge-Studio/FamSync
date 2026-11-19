import { cn } from "@/lib/utils";

const fills = { sage: "[&::-webkit-progress-value]:bg-sage-foreground [&::-moz-progress-bar]:bg-sage-foreground", peach: "[&::-webkit-progress-value]:bg-peach-foreground [&::-moz-progress-bar]:bg-peach-foreground",
  lavender: "[&::-webkit-progress-value]:bg-lavender-foreground [&::-moz-progress-bar]:bg-lavender-foreground", sky: "[&::-webkit-progress-value]:bg-sky-foreground [&::-moz-progress-bar]:bg-sky-foreground",
  rose: "[&::-webkit-progress-value]:bg-rose-foreground [&::-moz-progress-bar]:bg-rose-foreground", neutral: "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" };

// Native progress element (keeps its accessible value) styled as a soft rounded bar.
export function GoalProgressBar({ value, tone = "neutral", label = "Goal progress", className }: { value: number; tone?: keyof typeof fills; label?: string; className?: string }) {
  return (
    <progress max={100} value={value} aria-label={label}
      className={cn("h-2 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-all",
        fills[tone], className)} />
  );
}
