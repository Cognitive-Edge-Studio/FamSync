import { audienceLabels, formatDay } from "@famsync/core/calendar-date";
import { reminderLabel, type ReminderMinutes } from "@famsync/core/reminders";
import { dueText, repeatText, statusLabels } from "@famsync/core/tasks";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ErrorText } from "@/components/form";
import { Badge, confirm, Facts, LinkRow, Page, queryState, WithFamily } from "@/components/screen";
import { StatusButton, useTaskStatus } from "@/components/tasks";
import { Button, Card, Text } from "@/components/ui";
import { WorkSources } from "@/components/work-sources";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <><Stack.Screen options={{ title: "Task" }} /><WithFamily>{(family) => <Details key={family.id + id} family={family} id={id} />}</WithFamily></>;
}

function Details({ family, id }: { family: Family; id: string }) {
  const { access_token } = useSignedIn(), [note, setNote] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token);
    const task = required(await api.GET("/api/v1/families/{familyId}/tasks/{taskId}", { params: { path: { familyId: family.id, taskId: id } }, signal }));
    const series = task.series ? (await api.GET("/api/v1/families/{familyId}/task-series/{seriesId}", { params: { path: { familyId: family.id, seriesId: task.series.id } }, signal })).data : undefined;
    return { task, series };
  }, [access_token, family.id, id]);
  const query = useQuery(family.id, "task:" + id, load);
  const status = useTaskStatus(family.id, query.refresh), { busy, error, save } = useSave();
  const state = queryState(query, { loading: "Loading task…", failed: "The task couldn’t load", lost: "Task not found" });
  if (state || !query.data) return state;
  const { task, series } = query.data;

  async function archive(target: "task" | "series", archived: boolean) {
    setNote("");
    const api = getApi(access_token), path = { familyId: family.id };
    const result = target === "series" && series
      ? await save(() => api.PUT("/api/v1/families/{familyId}/task-series/{seriesId}/archive", { params: { path: { ...path, seriesId: series.id } }, body: { archived, version: series.version } }), "We couldn’t update the chore. Try again.")
      : await save(() => api.PUT("/api/v1/families/{familyId}/tasks/{taskId}/archive", { params: { path: { ...path, taskId: task.id } }, body: { archived, version: task.version } }), "We couldn’t update the task. Try again.");
    if (result.ok) setNote((target === "series" ? "Chore " : "Task ") + (archived ? "archived." : "restored."));
    if (result.ok || result.conflict || result.gone) query.refresh();
  }
  return (
    <Page query={query}>
      {status.feedback}
      {note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}
      <ErrorText>{error}</ErrorText>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><StatusButton task={task} state={status} /><Text size={20} weight="600" accessibilityRole="header" style={{ flex: 1 }}>{task.title}</Text></View>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}><Badge tone={task.status === "completed" ? "sage" : task.status === "in_progress" ? "sky" : "muted"}>{statusLabels[task.status]}</Badge>{task.overdue && <Badge tone="rose">Overdue</Badge>}{task.archived && <Badge>Archived</Badge>}</View>
        {task.description ? <Text>{task.description}</Text> : null}
      </Card>
      <Card><Facts rows={[
        ["Due", dueText(task, task.today)], ["Assigned to", task.assignee ? task.assignee.name + (task.assignee.current ? "" : " (former member)") : "Nobody"], ["Created by", task.author.name], ["Who can see it", audienceLabels[task.audience]],
        ["Reminder", task.remindMinutes == null ? null : reminderLabel(task.remindMinutes as ReminderMinutes, !task.dueTime)], ["Repeats", task.series ? repeatText(task.series) : null],
        ["This occurrence", task.customized ? "Edited separately from its chore" : null], ["Completed", task.completedAt ? new Date(task.completedAt).toLocaleString() + (task.completedBy ? " by " + task.completedBy.name : "") : null], ["Time zone", task.timeZone],
      ]} /></Card>
      {task.eventLink && <Card><LinkRow icon="calendar-outline" title={task.eventLink.title} note={task.eventLink.cancelled ? "Cancelled event" : "Linked event"} onPress={() => router.push({ pathname: "/event/[id]", params: { id: task.eventLink!.eventId, ...(task.eventLink!.occurrenceDate ? { occurrence: task.eventLink!.occurrenceDate } : {}) } })} /></Card>}
      <WorkSources familyId={family.id} kind="task" id={id} onUnlinked={query.refresh} />
      {series && series.upcoming.length > 0 && <Card><Text size={17} weight="600" accessibilityRole="header">Upcoming</Text>{series.upcoming.map((date) => <Text key={date} muted>{formatDay(date)}</Text>)}</Card>}
      {task.canEdit && !task.archived && <Button variant="outline" title={task.series ? "Edit this occurrence" : "Edit task"} onPress={() => router.push({ pathname: "/task/form", params: { id: task.id } })} />}
      {series?.canEdit && !series.archived && <Button variant="outline" title="Edit series" onPress={() => router.push({ pathname: "/task/form", params: { series: series.id } })} />}
      {task.canEdit && <Button variant="outline" busy={busy} title={task.archived ? "Restore task" : "Archive task"} onPress={() => task.archived ? void archive("task", false) : confirm("Archive this task?", "It leaves the task lists. You can restore it later.", "Archive", () => void archive("task", true))} />}
      {series?.canEdit && <Button variant="outline" busy={busy} title={series.archived ? "Restore chore" : "Archive chore"} onPress={() => series.archived ? void archive("series", false) : confirm("Archive this chore?", "It stops making new occurrences. You can restore it later.", "Archive", () => void archive("series", true))} />}
    </Page>
  );
}
