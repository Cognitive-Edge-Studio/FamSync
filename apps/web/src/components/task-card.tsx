"use client";
import { ModuleIcon } from "./ui/module-icon";


import { AlertCircle, Archive, CalendarDays, Repeat } from "lucide-react";
import { audienceLabels, eventPath } from "@/lib/calendar-date";
import { dueText, repeatShort, repeatText, statusLabels, taskPath, type Task, type TaskStatus } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { TaskStatusButtons } from "./task-status";
import { Avatar } from "./ui/avatar";
import { Badge, type BadgeTone } from "./ui/badge";
import { motion } from "motion/react";
import type { DOMAttributes, ReactNode, Ref } from "react";
import { taskCover } from "@/lib/task-cover";
import { TaskCover } from "./task-cover";
import { listItemMotion } from "./ui/motion";

const statusTones: Record<TaskStatus, BadgeTone> = { todo: "neutral", in_progress: "sky", completed: "sage" };

// Kanban-style card: title, soft badges, details, then the assignee and status actions below a divider.
// Board cards may add a cover illustration (when the topic is recognisable), a drag handle and a shared layout id
// so a card glides between columns when its status changes.
export function TaskCard({ task, familyId, today, busy, onChange, showStatus = false, cover = false, handle, nodeRef, dragProps, layoutId, dragging = false, pending = false }: {
  task: Task;
  familyId: string;
  today: string;
  busy: boolean;
  onChange: (status: TaskStatus) => void;
  showStatus?: boolean;
  cover?: boolean;
  handle?: ReactNode;
  nodeRef?: Ref<HTMLLIElement>;
  /** Mouse and touch drag listeners: when set, the whole card can be picked up. */
  dragProps?: Pick<DOMAttributes<HTMLLIElement>, "onMouseDown" | "onTouchStart">;
  layoutId?: string;
  dragging?: boolean;
  pending?: boolean;
}) {
  const topic = cover ? taskCover(task) : null;
  const hasBadges = task.overdue || showStatus || task.series || task.archived || task.eventLink?.cancelled;
  return (
    <motion.li {...listItemMotion} {...dragProps} ref={nodeRef}
      // Links inside the card must not start the browser's own link dragging.
      onDragStart={dragProps ? (event) => event.preventDefault() : undefined} layoutId={layoutId} layout={layoutId ? true : listItemMotion.layout} aria-busy={pending || undefined}
      className={cn("grid min-w-0 gap-3 rounded-xl border border-border bg-panel p-3.5 shadow-xs transition-[box-shadow,opacity] hover:shadow-sm",
        dragProps && "cursor-grab select-none active:cursor-grabbing", dragging && "opacity-40 shadow-none", pending && "ring-2 ring-ring/30")} data-task-id={task.id}>
      {topic && <TaskCover topic={topic} className={cn(task.status === "completed" && "opacity-60")} />}
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <a href={taskPath(familyId, task.id)}
            className={cn("block min-w-0 grow font-semibold wrap-anywhere hover:underline", task.status === "completed" && "text-muted-foreground line-through")}>
            {task.title}
          </a>
          {handle}
        </div>
        {hasBadges && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {task.overdue && <Badge tone="rose"><AlertCircle aria-hidden="true" className="size-3" />Overdue</Badge>}
            {showStatus && <Badge tone={statusTones[task.status]}>{statusLabels[task.status]}</Badge>}
            {task.series && <span title={repeatText(task.series)}><Badge tone="lavender"><Repeat aria-hidden="true" className="size-3" />{repeatShort(task.series)}<span className="sr-only">. {repeatText(task.series)}</span></Badge></span>}
            {task.archived && <Badge tone="outline"><Archive aria-hidden="true" className="size-3" />Archived</Badge>}
            {task.eventLink?.cancelled && <Badge tone="rose">Linked occurrence cancelled</Badge>}
          </div>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          {dueText(task, today)} <span aria-hidden="true">·</span> {audienceLabels[task.audience]}
        </p>
        {task.eventLink && (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm">
            <ModuleIcon name="calendar" className="size-3.5 shrink-0 text-muted-foreground" />
            <a className="wrap-anywhere underline underline-offset-4"
              href={eventPath(familyId, task.eventLink.eventId, task.eventLink.occurrenceDate ?? undefined)}>
              {task.eventLink.title}
            </a>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          {task.assignee
            ? <><Avatar name={task.assignee.name} colorKey={task.assignee.userId} size="sm" /><span className="truncate">{task.assignee.name}</span></>
            : <span className="text-muted-foreground">Unassigned</span>}
        </p>
        <TaskStatusButtons task={task} busy={busy} onChange={onChange} />
      </div>
    </motion.li>
  );
}
