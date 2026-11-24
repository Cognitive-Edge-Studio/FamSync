import type { components } from "@famsync/api-client";
import { audienceLabels, formatDay } from "@famsync/core/calendar-date";
import { amountProblem } from "@famsync/core/forms";
import { goalModeLabels, goalPriorityLabels, goalProgressText, goalTypeLabels, type GoalDetail } from "@famsync/core/goals";
import { statusLabels } from "@famsync/core/tasks";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ErrorText, Field, Row, Sheet } from "@/components/form";
import { Progress } from "@/components/goals";
import { Badge, confirm, Facts, LinkRow, Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Icon, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";

type Item = GoalDetail["checklist"][number];
type Result = { data?: GoalDetail; error?: unknown; response: Response };

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: "Goal" }} /><WithFamily>{(family) => <Details key={family.id + id} family={family} id={id} />}</WithFamily></>;
}

function Details({ family, id }: { family: Family; id: string }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), { busy, error, setError, save } = useSave(), path = { familyId: family.id, goalId: id };
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/goals/{goalId}", { params: { path: { familyId: family.id, goalId: id } }, signal }).then(required), [access_token, family.id, id]);
  const query = useQuery(family.id, "goal:" + id, load), goal = query.data;
  const [note, setNote] = useState(""), [step, setStep] = useState(""), [current, setCurrent] = useState<string>(), [renaming, setRenaming] = useState<{ item: Item; label: string }>(), [linking, setLinking] = useState(false);
  const stepId = useRef("");
  const state = queryState(query, { loading: "Loading goal…", failed: "The goal couldn’t load", lost: "Goal not found" });
  if (state || !goal) return state;

  async function change(call: (api: ReturnType<typeof getApi>) => Promise<Result>, done: string) {
    setNote("");
    const result = await save(() => call(getApi(access_token)), "We couldn’t save the goal change. Try again.");
    if (result.ok) { query.replace(() => result.data); setNote(done); return true; }
    // Someone changed the goal first: show the latest, and keep what was typed here.
    if (result.conflict || result.gone) query.refresh();
    return false;
  }
  const item = (itemId: string) => ({ params: { path: { ...path, itemId } } });
  async function addStep() {
    if (!step.trim()) return setError("Enter a step.");
    stepId.current ||= randomUUID();
    if (await change((api) => api.POST("/api/v1/families/{familyId}/goals/{goalId}/checklist", { params: { path }, body: { version: goal!.version, id: stepId.current, label: step.trim() } }), "Step added.")) { setStep(""); stepId.current = ""; }
  }
  async function saveNumber() {
    const value = current ?? String(goal!.current ?? 0), problem = amountProblem(value, false);
    if (problem) return setError(problem);
    if (await change((api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/progress", { params: { path }, body: { version: goal!.version, current: Number(value) } }), "Progress saved.")) setCurrent(undefined);
  }
  const editable = goal.canEdit && !goal.archived, progress = goal.canProgress && !goal.archived;
  return (
    <Page query={query}>
      {note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}
      <ErrorText>{error}</ErrorText>
      <Card>
        <Text size={20} weight="600" accessibilityRole="header">{goal.title}</Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}><Badge>{goalTypeLabels[goal.type]}</Badge><Badge tone={({ high: "rose", medium: "peach", low: "sky" } as const)[goal.priority]}>{goalPriorityLabels[goal.priority] + " priority"}</Badge>{goal.status === "completed" && <Badge tone="sage">Completed</Badge>}{goal.archived && <Badge>Archived</Badge>}{goal.pastTarget && <Badge tone="rose">Past target date</Badge>}</View>
        {goal.description ? <Text>{goal.description}</Text> : null}
        <Text weight="500">{goalProgressText(goal)}</Text>
        {goal.percentage !== null && <Progress value={goal.percentage} label="Goal progress" />}
        {goal.needsReassignment && <Text style={{ color: colors.onPeach }}>The assignee can no longer work on this goal. Choose another in Edit goal.</Text>}
        {goal.mode === "manual" && progress && <Button title={goal.status === "completed" ? "Reopen goal" : "Complete goal"} busy={busy} onPress={() => void change((api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/progress", { params: { path }, body: { version: goal.version, completed: goal.status !== "completed" } }), goal.status === "completed" ? "Goal reopened." : "Goal completed.")} />}
        {goal.mode === "numeric" && progress && <><Field label={"Current progress (" + goal.unit + ")"} value={current ?? String(goal.current ?? 0)} keyboardType="decimal-pad" onChangeText={setCurrent} /><Button title="Save progress" busy={busy} onPress={() => void saveNumber()} /></>}
      </Card>
      {goal.mode === "checklist" && <Card>
        <Text size={17} weight="600" accessibilityRole="header">Steps</Text>
        {goal.checklist.length === 0 && <Text muted>No steps yet.</Text>}
        {goal.checklist.map((entry) => entry.task ? (
          <View key={entry.id} style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}><LinkRow icon={entry.completed ? "checkmark-circle" : "link-outline"} title={entry.label} note={entry.task.archived ? "Archived task · Not counted" : statusLabels[entry.task.status] + " · Follows its task"} done={entry.completed} onPress={() => router.push({ pathname: "/task/[id]", params: { id: entry.task!.id } })} /></View>
            {editable && <IconButton name="unlink-outline" label={"Unlink " + entry.label} disabled={busy} onPress={() => confirm("Unlink this task?", "The task stays; it stops counting toward this goal.", "Unlink", () => void change((api) => api.DELETE("/api/v1/families/{familyId}/goals/{goalId}/task-links/{itemId}", { ...item(entry.id), body: { version: goal.version } }), "Task unlinked."))} />}
          </View>
        ) : (
          <View key={entry.id} style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: entry.completed, disabled: !progress || busy }} disabled={!progress || busy} style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 }}
              onPress={() => void change((api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/checklist/{itemId}", { ...item(entry.id), body: { version: goal.version, completed: !entry.completed } }), entry.completed ? "Step reopened." : "Step completed.")}>
              <Icon name={entry.completed ? "checkbox" : "square-outline"} size={24} color={progress ? colors.primary : colors.mutedForeground} /><Text style={{ flex: 1, ...(entry.completed ? { textDecorationLine: "line-through" as const, color: colors.mutedForeground } : {}) }}>{entry.label}</Text>
            </Pressable>
            {editable && <><IconButton name="pencil-outline" label={"Rename " + entry.label} disabled={busy} onPress={() => { setError(""); setRenaming({ item: entry, label: entry.label }); }} />
              <IconButton name="trash-outline" label={"Remove " + entry.label} disabled={busy} onPress={() => confirm("Remove this step?", entry.label, "Remove", () => void change((api) => api.DELETE("/api/v1/families/{familyId}/goals/{goalId}/checklist/{itemId}", { ...item(entry.id), body: { version: goal.version } }), "Step removed."))} /></>}
          </View>
        ))}
        {editable && goal.checklist.length < 100 && <><Field label="New step" value={step} maxLength={120} onChangeText={(value) => { setStep(value); stepId.current = ""; }} /><Button variant="outline" title="Add step" busy={busy} onPress={() => void addStep()} /><Button variant="outline" title="Link an existing task" onPress={() => setLinking(true)} /></>}
      </Card>}
      <Card><Facts rows={[["Category", goal.category], ["Tracked by", goalModeLabels[goal.mode]], ["Target date", goal.targetDate ? formatDay(goal.targetDate) : null], ["Assigned to", goal.assignee?.name], ["Created by", goal.author.name], ["Who can see it", audienceLabels[goal.audience ?? "family"]], ["Completed", goal.completedAt ? new Date(goal.completedAt).toLocaleString() : null]]} /></Card>
      {editable && <Button variant="outline" title="Edit goal" onPress={() => router.push({ pathname: "/goal/form", params: { id } })} />}
      {goal.canEdit && <Button variant="outline" title={goal.archived ? "Restore goal" : "Archive goal"} busy={busy} onPress={() => { const run = () => void change((api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/archive", { params: { path }, body: { version: goal.version, archived: !goal.archived } }), goal.archived ? "Goal restored." : "Goal archived."); if (goal.archived) run(); else confirm("Archive this goal?", "It leaves the goal lists. You can restore it later.", "Archive", run); }} />}
      {renaming && <Sheet title="Rename step" onClose={() => setRenaming(undefined)}><View style={{ gap: 12 }}><Field label="Step" value={renaming.label} maxLength={120} onChangeText={(label) => setRenaming({ ...renaming, label })} /><ErrorText>{error}</ErrorText>
        <Button title="Save step" busy={busy} onPress={() => { if (!renaming.label.trim()) return setError("Enter a step."); void change((api) => api.PUT("/api/v1/families/{familyId}/goals/{goalId}/checklist/{itemId}", { ...item(renaming.item.id), body: { version: goal.version, label: renaming.label.trim() } }), "Step renamed.").then((done) => { if (done) setRenaming(undefined); }); }} /></View></Sheet>}
      {linking && <Linker family={family} goal={goal} busy={busy} error={error} onClose={() => setLinking(false)} onLink={(task, itemId) => change((api) => api.POST("/api/v1/families/{familyId}/goals/{goalId}/task-links", { params: { path }, body: { version: goal.version, id: itemId, taskId: task.id, taskVersion: task.version } }), "Task linked.")} />}
    </Page>
  );
}

function IconButton({ name, label, onPress, disabled }: { name: React.ComponentProps<typeof Icon>["name"]; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name={name} size={22} color={colors.mutedForeground} /></Pressable>;
}

type Candidate = components["schemas"]["LinkableTaskDto"];
function Linker({ family, goal, busy, error, onClose, onLink }: { family: Family; goal: GoalDetail; busy: boolean; error: string; onClose: () => void; onLink: (task: Candidate, itemId: string) => Promise<boolean> }) {
  const { access_token } = useSignedIn(), [search, setSearch] = useState(""), [tasks, setTasks] = useState<Candidate[]>(), [next, setNext] = useState<string | null>(null), [cursor, setCursor] = useState<string>(), [failed, setFailed] = useState(false), [picked, setPicked] = useState<Candidate>();
  const itemId = useRef("");
  useEffect(() => {
    const controller = new AbortController(), timer = setTimeout(() => {
      setFailed(false);
      getApi(access_token).GET("/api/v1/families/{familyId}/goals/{goalId}/linkable-tasks", { params: { path: { familyId: family.id, goalId: goal.id }, query: { q: search.trim() || undefined, cursor, limit: 20 } }, signal: controller.signal }).then(required)
        .then((page) => { if (controller.signal.aborted) return; setTasks((old) => cursor ? [...(old ?? []), ...page.tasks.filter((task) => !old?.some((item) => item.id === task.id))] : page.tasks); setNext(page.nextCursor); })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }, cursor ? 0 : 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [access_token, family.id, goal.id, goal.version, search, cursor]);
  return (
    <Sheet title="Link an existing task" onClose={onClose}>
      <Field label="Find a task" value={search} maxLength={120} onChangeText={(value) => { setSearch(value); setCursor(undefined); setPicked(undefined); }} />
      {failed && <ErrorText>We couldn’t load matching tasks. Try again.</ErrorText>}
      {tasks?.length === 0 && <Text muted>No tasks can be linked.</Text>}
      {tasks?.map((task) => <Row key={task.id} title={task.title} note={statusLabels[task.status] + (task.dueDate ? " · Due " + formatDay(task.dueDate) : "")} selected={picked?.id === task.id} onPress={() => { setPicked(task); itemId.current = ""; }} />)}
      {next && <Button variant="outline" title="Load more" onPress={() => setCursor(next)} />}
      <ErrorText>{error}</ErrorText>
      <Button title="Link task" disabled={!picked} busy={busy} onPress={() => { itemId.current ||= randomUUID(); void onLink(picked!, itemId.current).then((done) => { if (done) onClose(); }); }} />
    </Sheet>
  );
}
