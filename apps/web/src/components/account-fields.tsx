"use client";

import type { ReactNode } from "react";

export const inputClass =
  "min-h-10 w-full rounded-lg border border-border bg-panel px-3 py-1.5 text-base text-foreground shadow-xs sm:min-h-9 sm:text-sm";

export function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>{label}</label>
      {children}
      {error && <p id={id + "-error"} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function FormFeedback({ error, note }: { error?: string; note?: string }) {
  return (
    <>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}
    </>
  );
}
