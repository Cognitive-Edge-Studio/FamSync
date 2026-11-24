import { statusLabels, taskStatuses, type Task, type TaskStatus } from "@famsync/core/tasks";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { AddButton, Badge, Chips, Page, queryState, WithFamily } from "@/components/screen";
import { TaskRow, useTaskStatus, type TaskStatusState } from "@/components/tasks";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSignedIn } from "@/lib/session";

export default function Tasks() { return <WithFamily>{(family, onLost) => <TaskList key={family.id} family={family} onLost={onLost} />}</WithFamily>; }

type Filter = "open" | "board" | "overdue" | "completed" | "archived";
type Column = { key: string; title: string; tasks: Task[]; next: string | null };

function TaskList({ family, onLost }: { family: Family; onLost: () => void }) {
  const { access_token } = useSignedIn(), { width } = useWindowDimensions();
  const [scope, setScope] = useState<"mine" | "all">("mine"), [filter, setFilter] = useState<Filter>("open");
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), path = { familyId: family.id };
    const list = (query: { status?: TaskStatus; overdue?: "true"; archived?: "true" }) => api.GET("/api/v1/families/{familyId}/tasks", { params: { path, query: { ...query, ...(scope === "mine" ? { scope } : {}), limit: 50 } }, signal }).then(required);
    const summary = api.GET("/api/v1/families/{familyId}/tasks/summary", { params: { path, query: { scope } }, signal }).then(required);
    const wanted: [string, Parameters<typeof list>[0]][] = filter === "overdue" ? [["Overdue", { overdue: "true" }]] : filter === "archived" ? [["Archived", { archived: "true" }]]
      : (filter === "completed" ? ["completed"] as const : filter === "open" ? ["in_progress", "todo"] as const : taskStatuses).map((status): [string, { status: TaskStatus }] => [statusLabels[status], { status }]);
    const [totals, ...pages] = await Promise.all([summary, ...wanted.map(([, query]) => list(query))]);
    return { totals, today: pages[0].today, columns: wanted.map(([title], index): Column => ({ key: title, title, tasks: pages[index].tasks, next: pages[index].nextCursor })) };
  }, [access_token, family.id, scope, filter]);
  const query = useQuery(family.id, "tasks:" + scope + ":" + filter, load);
  const status = useTaskStatus(family.id, query.refresh);
  const [more, setMore] = useState<string>();

  async function loadMore(column: Column) {
    if (!column.next || more) return;
    setMore(column.key);
    const named = taskStatuses.find((value) => statusLabels[value] === column.title);
    try {
      const page = required(await getApi(access_token).GET("/api/v1/families/{familyId}/tasks", { params: { path: { familyId: family.id }, query: { ...(named ? { status: named } : column.title === "Overdue" ? { overdue: "true" as const } : { archived: "true" as const }), ...(scope === "mine" ? { scope } : {}), cursor: column.next, limit: 50 } } }));
      query.replace((data) => ({ ...data, columns: data.columns.map((item) => item.key === column.key ? { ...item, tasks: [...item.tasks, ...page.tasks.filter((task) => !item.tasks.some((old) => old.id === task.id))], next: page.nextCursor } : item) }));
    } catch { /* The button stays, so it can be tried again. */ } finally { setMore(undefined); }
  }
  const state = queryState(query, { loading: "Loading tasks…", failed: "Tasks couldn’t load", lost: "You no longer have access" }, onLost), data = query.data;
  const column = (item: Column) => <TaskColumn key={item.key} column={item} today={data!.today} status={status} busy={more === item.key} onMore={() => void loadMore(item)} />;
  return (
    <Page query={query} footer={<AddButton label="New task" onPress={() => router.push("/task/form")} />}>
      <Chips label="Whose tasks" value={scope} onChange={setScope} choices={[{ value: "mine", label: "Mine" }, { value: "all", label: "Family" }]} />
      <Chips label="Show" value={filter} onChange={setFilter} choices={[{ value: "open", label: "Open" }, { value: "board", label: "Board" }, { value: "overdue", label: "Overdue" }, { value: "completed", label: "Completed" }, { value: "archived", label: "Archived" }]} />
      {data && <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}><Badge tone="sky">{data.totals.todo + data.totals.inProgress + " open"}</Badge><Badge tone={data.totals.overdue ? "rose" : "muted"}>{data.totals.overdue + " overdue"}</Badge><Badge tone="sage">{data.totals.completed + " completed"}</Badge></View>}
      {status.feedback}
      {state ?? (filter === "board"
        ? <ScrollView horizontal snapToInterval={Math.min(width - 48, 360) + 12} decelerationRate="fast" contentContainerStyle={{ gap: 12 }}>{data!.columns.map((item) => <View key={item.key} style={{ width: Math.min(width - 48, 360) }}>{column(item)}</View>)}</ScrollView>
        : data!.columns.map(column))}
    </Page>
  );
}

function TaskColumn({ column, today, status, busy, onMore }: { column: Column; today: string; status: TaskStatusState; busy: boolean; onMore: () => void }) {
  return (
    <Card>
      <Text size={17} weight="600" accessibilityRole="header">{column.title + " (" + column.tasks.length + (column.next ? "+" : "") + ")"}</Text>
      {column.tasks.length === 0 && <Text muted>Nothing here.</Text>}
      {column.tasks.map((task) => <TaskRow key={task.id} task={task} today={today} state={status} />)}
      {column.next && <Button variant="outline" title="Load more" busy={busy} onPress={onMore} />}
    </Card>
  );
}
