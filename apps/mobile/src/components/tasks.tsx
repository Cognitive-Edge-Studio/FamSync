import { dueText, repeatShort, statusChangeLabels, statusLabels, taskStatuses, type Task, type TaskDetail, type TaskStatus } from "@famsync/core/tasks";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { getApi } from "@/lib/api";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { ErrorText, Row, Sheet } from "./form";
import { Badge } from "./screen";
import { Button, Card, Icon, Text } from "./ui";
import { MotionPressable } from './motion';

type Change = Pick<Task, "id" | "version" | "status">;

/** Status changes carry the version they were based on; a conflict reloads instead of overwriting. Undo is offered once. */
export function useTaskStatus(familyId: string, onChanged: (task?: TaskDetail) => void) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave();
  const [notice, setNotice] = useState<{ task: TaskDetail; previous: TaskStatus }>();
  const send = useCallback(async (task: Change, status: TaskStatus, undo: boolean) => {
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/tasks/{taskId}/status", { params: { path: { familyId, taskId: task.id } }, body: { status, version: task.version } }), "We couldn’t update the task. Try again.");
    if (result.ok) {
      setNotice(undo ? undefined : { task: result.data, previous: task.status });
      onChanged(result.data);
    } else {
      setNotice(undefined);
      if (result.conflict || result.gone) onChanged();
    }
  }, [access_token, familyId, onChanged, save]);
  return {
    busy,
    change: (task: Change, status: TaskStatus) => void send(task, status, false),
    feedback: notice || error ? (
      <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
        {notice && <Card style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}><Text style={{ flex: 1, minWidth: 160 }}>{statusChangeLabels[notice.task.status] + ": " + notice.task.title}</Text>
          <Button variant="outline" title="Undo" busy={busy} onPress={() => void send(notice.task, notice.previous, true)} /></Card>}
        <ErrorText>{error}</ErrorText>
      </View>) : null,
  };
}
export type TaskStatusState = ReturnType<typeof useTaskStatus>;

export function StatusButton({ task, state }: { task: Task; state: TaskStatusState }) {
  const { colors } = useTheme(), [open, setOpen] = useState(false);
  const allowed = task.canChangeStatus && !task.archived;
  const icon = task.status === "completed" ? "checkmark-circle" : task.status === "in_progress" ? "contrast-outline" : "ellipse-outline";
  return (
    <>
      <MotionPressable accessibilityRole="button" accessibilityLabel={"Status of " + task.title + ": " + statusLabels[task.status]} accessibilityHint={allowed ? "Changes the status" : undefined} accessibilityState={{ disabled: !allowed || state.busy }} disabled={!allowed || state.busy} onPress={() => setOpen(true)}
        style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={26} color={allowed ? colors.primary : colors.mutedForeground} /></MotionPressable>
      {open && <Sheet title={task.title} onClose={() => setOpen(false)}>
        {taskStatuses.map((status) => <Row key={status} title={statusLabels[status]} selected={status === task.status} onPress={() => { setOpen(false); if (status !== task.status) state.change(task, status); }} />)}
      </Sheet>}
    </>
  );
}

export function TaskRow({ task, today, state }: { task: Task; today: string; state: TaskStatusState }) {
  const { colors } = useTheme();
  const note = [dueText(task, today), task.assignee?.name].filter(Boolean).join(" · ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <StatusButton task={task} state={state} />
      <MotionPressable accessibilityRole="button" accessibilityLabel={task.title + ", " + note + (task.overdue ? ", overdue" : "")} onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
        style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 4, justifyContent: "center", gap: 4, backgroundColor: pressed ? colors.accent : "transparent" })}>
        <Text weight="500" style={task.status === "completed" ? { textDecorationLine: "line-through", color: colors.mutedForeground } : undefined}>{task.title}</Text>
        <Text muted size={13}>{note}</Text>
        {(task.overdue || task.series || task.archived) && <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {task.overdue && <Badge tone="rose">Overdue</Badge>}{task.series && <Badge tone="lavender">{repeatShort(task.series)}</Badge>}{task.archived && <Badge>Archived</Badge>}</View>}
      </MotionPressable>
    </View>
  );
}
