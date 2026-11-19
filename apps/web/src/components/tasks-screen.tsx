"use client";

import type { components } from "@famsync/api-client";
import type { Session } from "@supabase/auth-js";
import { GripVertical, LayoutGrid, List, Plus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEventHandler, type MouseEventHandler, type TouchEventHandler } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { getBrowserApi } from "@/lib/browser-auth";
import { takeCreateRequest } from "@/lib/quick-create";
import { statusLabels, taskPath, taskStatuses, type Task, type TaskStatus, type TaskSummary } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { FormFeedback, inputClass } from "./account-fields";
import { AppShell } from "./app-shell";
import { FamilySession } from "./family-session";
import { ScheduleFamily } from "./schedule-family";
import { TaskCard } from "./task-card";
import { TaskFormDialog } from "./task-form-dialog";
import { useTaskStatus } from "./task-status";
import { Button } from "./ui/button";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { EmptyState } from "./ui/empty-state";
import { PageHeader } from "./ui/page-header";
import { Segmented } from "./ui/segmented";

type Family = components["schemas"]["FamilyDto"];
type Filter = "all" | "overdue" | "archived" | TaskStatus;
type Scope = "all" | "mine";
type ListQuery = {
  status?: TaskStatus; overdue?: "true"; scope?: "mine"; due?: "today"; archived?: "true"; event?: string; occurrence?: string;
};
const viewKey = "famsync-task-view";

function storedView(): "board" | "list" {
  try {
    return localStorage.getItem(viewKey) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
}

export function useTaskSummary(accessToken: string, familyId: string, scope: Scope, revision: number) {
  const [summary, setSummary] = useState<TaskSummary>();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/tasks/summary", {
      params: { path: { familyId }, query: { scope } }, signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      if (data) setSummary(data);
      else setError(true);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [accessToken, familyId, scope, revision]);
  return { summary, error };
}

export function useTaskList(accessToken: string, familyId: string, query: ListQuery, revision: number) {
  const [tasks, setTasks] = useState<Task[]>();
  const [today, setToday] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [loadedRevision, setLoadedRevision] = useState(-1);
  const key = JSON.stringify(query);

  async function fetchPage(after: string | undefined, signal?: AbortSignal) {
    const { data } = await getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/tasks", {
      params: { path: { familyId }, query: { ...JSON.parse(key) as ListQuery, cursor: after } }, signal,
    });
    if (!data) throw new Error("Tasks unavailable");
    return data;
  }

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetchPage(undefined, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setTasks(page.tasks);
      setToday(page.today);
      setCursor(page.nextCursor);
      setLoadedRevision(revision);
    }).catch(() => { if (!controller.signal.aborted) setError("We couldn’t load tasks."); });
    return () => controller.abort();
    // fetchPage reads only accessToken, familyId, and key.
  }, [accessToken, familyId, key, revision]);

  async function loadMore() {
    if (!cursor || more) return;
    setMore(true);
    try {
      const page = await fetchPage(cursor);
      setTasks((current) => [...(current ?? []), ...page.tasks]);
      setCursor(page.nextCursor);
    } catch {
      setError("We couldn’t load more tasks.");
    } finally {
      setMore(false);
    }
  }
  return { tasks, today, error, hasMore: !!cursor, loadingMore: more, loadMore, loadedRevision };
}

const columnDots: Record<string, string> = { "To Do": "bg-muted-foreground", "In Progress": "bg-sky-foreground", Completed: "bg-sage-foreground" };

// A status change shown before the server confirms it. It applies until a column has loaded the refresh
// that follows the save (`until`), so a card never flickers back to its old column.
type Move = { task: Task; from: TaskStatus; to: TaskStatus; until: number; via: "drag" | "button" };
type Moves = Record<string, Move>;

function applyMoves(tasks: Task[] | undefined, moves: Moves, loadedRevision: number, columnStatus?: TaskStatus) {
  if (!tasks) return tasks;
  const active = Object.values(moves).filter((move) => loadedRevision < move.until);
  const updated = (task: Task) => active.find((move) => move.task.id === task.id)?.task ?? task;
  if (!columnStatus) return tasks.map(updated);
  const kept = tasks.filter((task) => {
    const move = active.find((item) => item.task.id === task.id);
    return !move || move.to === columnStatus;
  }).map(updated);
  const arriving = active.filter((move) => move.to === columnStatus && !kept.some((task) => task.id === move.task.id)).map((move) => move.task);
  return [...arriving, ...kept];
}

function DraggableTaskCard({ task, columnStatus, disabled, ...props }: Omit<Parameters<typeof TaskCard>[0], "handle" | "nodeRef" | "dragProps" | "dragging"> & {
  columnStatus: TaskStatus; disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: task.id, data: { task, from: columnStatus }, disabled });
  const movable = task.canChangeStatus && !task.archived;
  // The whole card responds to mouse and touch. The grip stays as the keyboard handle and a visual hint,
  // so Space on the card's own buttons never starts a drag.
  const handle = movable ? (
    <button type="button" ref={setActivatorNodeRef} {...attributes} onKeyDown={listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined} aria-label={"Move “" + task.title + "”"} title="Drag the card to another column"
      className="-mt-0.5 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40">
      <GripVertical aria-hidden="true" className="size-4" />
    </button>
  ) : undefined;
  const dragProps = movable && !disabled ? { onMouseDown: listeners?.onMouseDown as MouseEventHandler<HTMLLIElement> | undefined, onTouchStart: listeners?.onTouchStart as TouchEventHandler<HTMLLIElement> | undefined } : undefined;
  return <TaskCard task={task} {...props} handle={handle} nodeRef={setNodeRef} dragProps={dragProps} dragging={isDragging} />;
}

function TaskColumn({ title, familyId, accessToken, query, revision, status, layout, columnStatus, moves, onMove, draggable }: {
  title: string;
  familyId: string;
  accessToken: string;
  query: ListQuery;
  revision: number;
  status: ReturnType<typeof useTaskStatus>;
  layout: "board" | "list";
  columnStatus?: TaskStatus;
  moves: Moves;
  onMove: (task: Task, to: TaskStatus, via: Move["via"]) => void;
  draggable: boolean;
}) {
  const { tasks: loaded, today, error, hasMore, loadingMore, loadMore, loadedRevision } = useTaskList(accessToken, familyId, query, revision);
  const tasks = applyMoves(loaded, moves, loadedRevision, columnStatus);
  const { setNodeRef, isOver, active } = useDroppable({ id: columnStatus ?? title, disabled: !draggable || !columnStatus });
  const dropping = isOver && active?.data.current?.from !== columnStatus;
  const headingId = "tasks-" + title.toLowerCase().replace(/\W+/g, "-");
  return (
    <section ref={setNodeRef} aria-labelledby={headingId} data-column={columnStatus} data-today={today}
      className={cn("grid min-w-0 content-start gap-3 rounded-2xl p-3 transition-[background-color,box-shadow] duration-200",
        layout === "board" ? "bg-muted" : "border border-border bg-panel p-4",
        dropping && "bg-accent ring-2 ring-primary/50")}>
      <h2 id={headingId} className="flex items-center gap-2 px-1 pt-1 text-base font-semibold">
        {columnDots[title] && <span aria-hidden="true" className={cn("size-2 rounded-full", columnDots[title])} />}
        {title}
        {tasks && <span className="text-sm font-normal text-muted-foreground">{tasks.length}{hasMore ? "+" : ""}</span>}
      </h2>
      {error && <FormFeedback error={error} />}
      {!tasks && !error && <FormFeedback note="Loading tasks…" />}
      {tasks && tasks.length === 0 && (
        <p className={cn("rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground transition-colors",
          dropping ? "border-primary/60 bg-panel" : "border-border bg-panel/60")}>
          {dropping ? "Drop here" : "No tasks here."}
        </p>
      )}
      {tasks && tasks.length > 0 && (
        <ul className="grid gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {tasks.map((task) => {
              const move = moves[task.id];
              const pending = !!move && loadedRevision < move.until;
              const props = {
                task, familyId, today, showStatus: layout === "list", cover: layout === "board", pending,
                // Button moves glide between columns; a dragged card settles where it was dropped.
                layoutId: layout === "board" && !(pending && move.via === "drag") ? "task-" + task.id : undefined,
                busy: status.busy === task.id || pending,
                onChange: (next: TaskStatus) => onMove(task, next, "button"),
              };
              return draggable && columnStatus
                ? <DraggableTaskCard key={task.id} {...props} columnStatus={columnStatus} disabled={!!status.busy || pending} />
                : <TaskCard key={task.id} {...props} />;
            })}
          </AnimatePresence>
        </ul>
      )}
      {hasMore && (
        <Button variant="outline" className="h-9 justify-self-start px-3" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  );
}

// Keyboard dragging jumps between columns (in status order) instead of nudging by pixels.
const columnKeys = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"]);
const columnCoordinates: KeyboardCoordinateGetter = (event, { context: { droppableRects, collisionRect, over, active } }) => {
  if (!columnKeys.has(event.code) || !collisionRect) return undefined;
  event.preventDefault();
  const order = taskStatuses.filter((value) => droppableRects.has(value));
  const current = order.indexOf((over?.id ?? active?.data.current?.from) as TaskStatus);
  const step = event.code === "ArrowRight" || event.code === "ArrowDown" ? 1 : -1;
  const target = order[Math.min(order.length - 1, Math.max(0, current + step))];
  const rect = target && droppableRects.get(target);
  if (!rect) return undefined;
  return { x: rect.left + (rect.width - collisionRect.width) / 2, y: rect.top + 44 };
};
const pointerFirst: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};
const columnName = (id: unknown) => statusLabels[id as TaskStatus] ?? "this column";
const dragTitle = (data: Record<string, unknown> | undefined) => "“" + ((data?.task as Task | undefined)?.title ?? "task") + "”";
const announcements: Announcements = {
  onDragStart: ({ active }) => "Picked up " + dragTitle(active.data.current) + " from " + columnName(active.data.current?.from)
    + ". Use the arrow keys to choose a column, Space or Enter to drop, Escape to cancel.",
  onDragOver: ({ active, over }) => over ? dragTitle(active.data.current) + " is over " + columnName(over.id) + "." : dragTitle(active.data.current) + " is not over a column.",
  onDragEnd: ({ active, over }) => over && over.id !== active.data.current?.from
    ? "Moved " + dragTitle(active.data.current) + " to " + columnName(over.id) + "."
    : dragTitle(active.data.current) + " stays in " + columnName(active.data.current?.from) + ".",
  onDragCancel: ({ active }) => "Move cancelled. " + dragTitle(active.data.current) + " stays in " + columnName(active.data.current?.from) + ".",
};
const instructions = {
  draggable: "To move a task, drag the card, or focus its Move handle and press Space or Enter, use the arrow keys to choose a column, then press Space or Enter to drop it. Press Escape to cancel. The Start, Complete and Reopen buttons do the same.",
};

function TaskBoard({ family, session }: { family: Family; session: Session }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<Scope>("all");
  const [view, setView] = useState<"board" | "list">(storedView);
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(() => takeCreateRequest("task"));
  const [saved, setSaved] = useState<{ title: string; href?: string; chore: boolean }>();
  const createButton = useRef<HTMLButtonElement>(null);
  const refresh = () => setRevision((value) => value + 1);
  const status = useTaskStatus(session.access_token, family.id, refresh);
  const [moves, setMoves] = useState<Moves>({});
  const [dragged, setDragged] = useState<{ task: Task; today: string }>();
  const sensors = useSensors(
    // Mouse: a short move picks the card up, so plain clicks on its links and buttons still work.
    // Touch: press and hold, so swiping over cards still scrolls the page.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates }),
  );

  // Show the move at once, then save it. A failed save puts the card back; a conflict reloads the board.
  async function move(task: Task, to: TaskStatus, via: Move["via"]) {
    if (status.busy || to === task.status) return;
    const optimistic: Task = { ...task, status: to, overdue: to === "completed" ? false : task.overdue };
    setMoves((current) => ({ ...current, [task.id]: { task: optimistic, from: task.status, to, until: revision + 1, via } }));
    const saved = await status.change(task, to);
    if (!saved) setMoves((current) => { const next = { ...current }; delete next[task.id]; return next; });
  }

  function dragStart({ active }: DragStartEvent) {
    const task = active.data.current?.task as Task | undefined;
    const column = document.querySelector('[data-column="' + String(active.data.current?.from) + '"]');
    if (task) setDragged({ task, today: column?.getAttribute("data-today") ?? "" });
  }
  function dragEnd({ active, over }: DragEndEvent) {
    setDragged(undefined);
    const task = active.data.current?.task as Task | undefined;
    const to = over?.id as TaskStatus | undefined;
    if (task && to && taskStatuses.includes(to) && to !== active.data.current?.from) void move(task, to, "drag");
  }

  const { summary, error: summaryError } = useTaskSummary(session.access_token, family.id, scope, revision);

  function chooseView(next: "board" | "list") {
    setView(next);
    try {
      localStorage.setItem(viewKey, next);
    } catch {
      // The choice still applies for this visit.
    }
  }

  const filters: { value: Filter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: summary?.all },
    { value: "overdue", label: "Overdue", count: summary?.overdue },
    { value: "todo", label: statusLabels.todo, count: summary?.todo },
    { value: "in_progress", label: statusLabels.in_progress, count: summary?.inProgress },
    { value: "completed", label: statusLabels.completed, count: summary?.completed },
    { value: "archived", label: "Archived", count: summary?.archived },
  ];
  const mine = scope === "mine" ? { scope: "mine" as const } : {};
  const columns: { title: string; query: ListQuery; columnStatus?: TaskStatus }[] = filter === "archived"
    ? [{ title: "Archived tasks", query: { ...mine, archived: "true" } }]
    : view === "list"
    ? [{ title: filters.find(({ value }) => value === filter)!.label + " tasks", query: {
      ...mine, ...(filter === "overdue" ? { overdue: "true" as const } : filter === "all" ? {} : { status: filter }),
    } }]
    : taskStatuses
      .filter((value) => filter === "all" || filter === value || (filter === "overdue" && value !== "completed"))
      .map((value) => ({ title: statusLabels[value], columnStatus: value, query: { ...mine, status: value, ...(filter === "overdue" ? { overdue: "true" as const } : {}) } }));

  return (
    <div className="grid gap-5">
      <PageHeader className="mb-0" title="Tasks"
        actions={<Button ref={createButton} className="gap-2" onClick={() => setCreating(true)}><Plus aria-hidden="true" />New task</Button>} />

      {saved && (
        <p role="status" className="rounded-xl bg-sage px-3 py-2 text-sm font-medium wrap-anywhere text-sage-foreground">
          {saved.chore ? "Chore saved: " : "Task saved: "}
          {saved.href ? <a className="underline underline-offset-4" href={saved.href}>{saved.title}</a> : saved.title}
        </p>
      )}
      {status.feedback}

      <div className="grid gap-4 rounded-2xl border border-border bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="task-scope" className="text-sm font-medium">Show</label>
            <select id="task-scope" className={inputClass + " w-40 sm:w-40"} value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
              <option value="all">Whole family</option>
              <option value="mine">My items</option>
            </select>
          </div>
          <Segmented label="Layout" value={view} onChange={chooseView}
            options={[{ value: "board", label: <><LayoutGrid aria-hidden="true" />Board</> }, { value: "list", label: <><List aria-hidden="true" />List</> }]} />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Task filters">
          {filters.map(({ value, label, count }) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-border px-3 text-sm font-medium transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
              {label}
              <span className={cn("rounded-full px-1.5 text-xs", filter === value ? "bg-primary-foreground/20" : "bg-muted")}
                data-count={value}>{count ?? "–"}</span>
            </button>
          ))}
        </div>
      </div>
      {summaryError && <FormFeedback error="We couldn’t load task counts." />}

      <DndContext sensors={sensors} collisionDetection={pointerFirst} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setDragged(undefined)}
        accessibility={{ announcements, screenReaderInstructions: instructions }}>
        <LayoutGroup>
          <div className={cn("grid items-start gap-4", view === "board" && columns.length > 1 && "md:grid-cols-2 xl:grid-cols-3")}>
            {columns.map(({ title, query, columnStatus }) => (
              <TaskColumn key={title + JSON.stringify(query)} title={title} familyId={family.id} accessToken={session.access_token}
                query={query} revision={revision} status={status} layout={view} columnStatus={columnStatus} moves={moves}
                onMove={(task, to, via) => void move(task, to, via)} draggable={view === "board" && columns.length > 1} />
            ))}
          </div>
        </LayoutGroup>
        {/* The lifted card follows the pointer. It is a picture of the card, so its controls are inert. */}
        <DragOverlay dropAnimation={null}>
          {dragged && (
            <motion.div initial={{ scale: 1, rotate: 0 }} animate={{ scale: 1.03, rotate: -1.5 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className="pointer-events-none cursor-grabbing rounded-xl shadow-2xl" inert>
              <ul>
                <TaskCard task={dragged.task} familyId={family.id} today={dragged.today} busy cover onChange={() => undefined}
                  handle={<span className="-mt-0.5 -mr-1.5 inline-flex size-7 items-center justify-center rounded-md bg-accent text-foreground"><GripVertical aria-hidden="true" className="size-4" /></span>} />
              </ul>
            </motion.div>
          )}
        </DragOverlay>
      </DndContext>


      {summary && summary.all === 0 && (
        <EmptyState icon="tasks" title="No tasks yet">Create a task to share a chore or a to-do with your family.</EmptyState>
      )}

      {creating && (
        <TaskFormDialog family={family} accessToken={session.access_token} userId={session.user.id} trigger={createButton}
          onClose={() => setCreating(false)}
          onSaved={(result) => {
            setCreating(false);
            setSaved(result.kind === "task"
              ? { title: result.task.title, href: taskPath(family.id, result.task.id), chore: false }
              : { title: result.series.title, chore: true });
            refresh();
          }} />
      )}
    </div>
  );
}

export function TasksScreen() {
  return (
    <AppShell activePage="tasks">
      <div className="pb-4">
        <FamilySession>
          {(session) => (
            <ScheduleFamily key={session.user.id} session={session} section="tasks">
              {(family) => <TaskBoard key={family.id} family={family} session={session} />}
            </ScheduleFamily>
          )}
        </FamilySession>
      </div>
    </AppShell>
  );
}
