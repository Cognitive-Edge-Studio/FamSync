import { ModuleIcon, type ModuleIconName } from "./module-icon";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A calm empty or no-results state: soft tinted icon, short title, one sentence and an optional action.
export function EmptyState({ icon, title, children, action, tone = "sage", className }: {
  icon: ModuleIconName; title: string; children?: ReactNode; action?: ReactNode; tone?: "sage" | "peach" | "lavender" | "sky"; className?: string;
}) {
  const tint = { sage: "bg-sage text-sage-foreground", peach: "bg-peach text-peach-foreground", lavender: "bg-lavender text-lavender-foreground", sky: "bg-sky text-sky-foreground" }[tone];
  return (
    <div className={cn("grid justify-items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-10 text-center", className)}>
      <span className={cn("mb-1 grid size-20 place-items-center rounded-2xl", tint)}><ModuleIcon name={icon} className="size-16" /></span>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
