"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Reference tab track: tinted 36 px track, the selected option raised on white. Uses pressed buttons, not ARIA tabs,
// because each option filters the same content rather than switching panels.
export function Segmented<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex h-9 items-center gap-0.5 rounded-lg bg-muted p-1", className)}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-panel aria-pressed:text-foreground aria-pressed:shadow-xs [&_svg]:size-4">
          {option.label}
        </button>
      ))}
    </div>
  );
}
