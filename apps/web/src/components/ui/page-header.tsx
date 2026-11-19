import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

// Plain title row: the page title, an optional short line of context, and actions on the right. No panel around it.
export function PageHeader({ title, description, crumbs, actions, className }: {
  title: ReactNode; description?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("mt-5 mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mt-7", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl leading-8 font-semibold tracking-tight wrap-anywhere">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions}
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="text-sm">
            <ol className="flex items-center gap-2">
              {crumbs.map((crumb, index) => (
                <li key={crumb.label + index} className="flex items-center gap-2">
                  {index > 0 && <span aria-hidden="true" className="text-muted-foreground">/</span>}
                  {crumb.href && index < crumbs.length - 1
                    ? <a href={crumb.href} className="hover:underline">{crumb.label}</a>
                    : <span aria-current="page" className="block max-w-[14rem] truncate text-muted-foreground">{crumb.label}</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>
    </div>
  );
}
