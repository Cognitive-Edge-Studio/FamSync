import { audienceLabels, civilDate, dayInZone, eventDays, eventTime, formatDay, localMinuteInZone, shiftDay } from "@famsync/core/calendar-date";
import { readSchedule, type ScheduleDraft } from "@famsync/core/forms";
import { dueText, repeatText, type Task } from "@famsync/core/tasks";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import { DateField, ErrorText, Row, Sheet, TimeField } from "@/components/form";
import { Badge, confirm, Facts, Page, queryState, WithFamily } from "@/components/screen";
import { TaskRow, useTaskStatus } from "@/components/tasks";
import { Button, Card, Text } from "@/components/ui";
import { WorkSources } from "@/components/work-sources";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

export default function EventScreen() {
  const { id, occurrence } = useLocalSearchParams<{ id: string; occurrence?: string }>();
  return <><Stack.Screen options={{ title: "Event" }} /><WithFamily>{(family) => <Details key={family.id + id + occurrence} family={family} id={id} occurrence={occurrence} />}</WithFamily></>;
}

function Details({ family, id, occurrence }: { family: Family; id: string; occurrence?: string }) {
  const { access_token } = useSignedIn(), { busy, error, setError, save } = useSave(), path = { familyId: family.id, eventId: id };
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token);
    const event = required(await api.GET("/api/v1/families/{familyId}/events/{eventId}", { params: { path: { familyId: family.id, eventId: id }, query: { occurrence } }, signal }));
    const tasks = required(await api.GET("/api/v1/families/{familyId}/tasks", { params: { path: { familyId: family.id }, query: { event: id, occurrence: event.occurrence?.originalDate } }, signal }));
    return { event, tasks };
  }, [access_token, family.id, id, occurrence]);
  const query = useQuery(family.id, "event:" + id + ":" + (occurrence ?? ""), load), status = useTaskStatus(family.id, query.refresh);
  const [moving, setMoving] = useState<ScheduleDraft>(), [shift, setShift] = useState(false), [note, setNote] = useState("");
  const state = queryState(query, { loading: "Loading event…", failed: "The event couldn’t load", lost: "Event not found" });
  if (state || !query.data) return state;
  const { event, tasks } = query.data, series = event.series, original = event.occurrence?.originalDate, cancelled = event.occurrence?.status === "cancelled";
  const { first, last } = eventDays(event, event.timeZone), canChange = !!original && !!series?.canEdit && !cancelled;
  // A repeating event is moved in its own time zone, whatever zone the family uses now.
  const local = (): ScheduleDraft => event.allDay ? { allDay: true, startDate: event.start, startTime: "", endDate: shiftDay(event.end, -1), endTime: "" }
    : (() => { const from = localMinuteInZone(event.start, series!.timeZone), to = localMinuteInZone(event.end, series!.timeZone); return { allDay: false, startDate: from.slice(0, 10), startTime: from.slice(11), endDate: to.slice(0, 10), endTime: to.slice(11) }; })();
  const movable = tasks.tasks.filter((task) => task.canEdit && !task.archived && task.dueDate);
  const shiftDays = moving ? Math.round((civilDate(moving.startDate).getTime() - civilDate(local().startDate).getTime()) / 86400000) : 0;

  async function change(body: { action: "cancel" } | { action: "move"; start: string; end: string; shiftLinkedTasks?: { id: string; version: number }[] }) {
    setNote("");
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/events/{eventId}/occurrences/{originalDate}", { params: { path: { ...path, originalDate: original! } }, body }), "We couldn’t save this occurrence. Try again.");
    if (result.ok) {
      setMoving(undefined);
      const count = result.data.shiftedTaskCount ?? 0;
      setNote(body.action === "cancel" ? "This occurrence is cancelled." : "Occurrence moved." + (count ? " " + count + (count === 1 ? " linked task" : " linked tasks") + " moved too." : ""));
    }
    if (result.ok || result.conflict || result.gone) query.refresh();
  }
  function submitMove() {
    const read = readSchedule(moving!);
    if ("problem" in read) return setError(read.problem);
    void change({ action: "move", start: read.schedule.start, end: read.schedule.end, ...(shift && shiftDays !== 0 && movable.length ? { shiftLinkedTasks: movable.map(({ id: taskId, version }) => ({ id: taskId, version })) } : {}) });
  }
  async function openAttachment() {
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/events/{eventId}/attachment/download", { params: { path, query: { occurrence } } }), "We couldn’t open the attachment. Try again.");
    if (result.ok) await Linking.openURL(result.data.url).catch(() => setError("No app on this phone can open this attachment."));
  }
  const set = (value: Partial<ScheduleDraft>) => setMoving((old) => old && { ...old, ...value });
  const today = dayInZone(new Date(), event.timeZone), shifted = (task: Task) => ({ ...task, dueDate: shiftDay(task.dueDate!, shiftDays) });
  return (
    <Page query={query}>
      {status.feedback}
      {note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}
      {!moving && <ErrorText>{error}</ErrorText>}
      <Card>
        <Text size={20} weight="600" accessibilityRole="header">{event.title}</Text>
        {(cancelled || event.occurrence?.status === "moved") && <View style={{ flexDirection: "row" }}><Badge tone={cancelled ? "rose" : "peach"}>{cancelled ? "Cancelled" : "Moved"}</Badge></View>}
        <Facts rows={[["When", (first === last ? formatDay(first) : formatDay(first) + " – " + formatDay(last)) + ", " + eventTime(event, event.timeZone)], ["Time zone", event.timeZone], ["Location", event.location], ["Who can see it", audienceLabels[event.audience]], ["Repeats", series ? repeatText(series) + " (" + series.timeZone + ")" : null], ["Note", event.note]]} />
        {event.attachment && <Button variant="outline" title={"Open " + event.attachment.fileName} busy={busy} onPress={() => void openAttachment()} />}
      </Card>
      <Card>
        <Text size={17} weight="600" accessibilityRole="header">Linked tasks</Text>
        {tasks.tasks.length === 0 ? <Text muted>No linked tasks.</Text> : tasks.tasks.map((task) => <TaskRow key={task.id} task={task} today={tasks.today} state={status} />)}
        {!cancelled && <Button variant="outline" title="Add a linked task" onPress={() => router.push({ pathname: "/task/form", params: { event: id, ...(original ? { occurrence: original } : {}), day: first, label: event.title } })} />}
      </Card>
      <WorkSources familyId={family.id} kind="event" id={id} onUnlinked={query.refresh} />
      {canChange && <><Button variant="outline" title="Move this occurrence" onPress={() => { setError(""); setShift(false); setMoving(local()); }} />
        <Button variant="outline" title="Cancel this occurrence" busy={busy} onPress={() => confirm("Cancel this occurrence?", "It will be removed from Calendar and Today. The rest of the series stays scheduled.", "Cancel it", () => void change({ action: "cancel" }))} /></>}
      {moving && <Sheet title="Move this occurrence" onClose={() => { if (!busy) setMoving(undefined); }}>
        <View style={{ gap: 14 }}>
          <Text muted>{"This changes one occurrence. Times use " + series!.timeZone + "."}</Text>
          <DateField label="New start date" value={moving.startDate} today={today} onChange={(startDate) => set({ startDate })} />
          {!moving.allDay && <TimeField label="New start time" value={moving.startTime} onChange={(startTime) => set({ startTime })} />}
          <DateField label={moving.allDay ? "New last day" : "New end date"} value={moving.endDate} today={today} onChange={(endDate) => set({ endDate })} />
          {!moving.allDay && <TimeField label="New end time" value={moving.endTime} onChange={(endTime) => set({ endTime })} />}
          {movable.length > 0 && shiftDays !== 0 && <View><Row multiple title={"Also move " + (movable.length === 1 ? "the linked task" : movable.length + " linked tasks") + " by " + Math.abs(shiftDays) + (Math.abs(shiftDays) === 1 ? " day" : " days") + (shiftDays < 0 ? " earlier" : " later")} selected={shift} onPress={() => setShift(!shift)} />
            {movable.map((task) => <Text key={task.id} muted size={13}>{task.title + ": " + dueText(task, tasks.today) + " → " + dueText(shifted(task), tasks.today)}</Text>)}</View>}
          <ErrorText>{error}</ErrorText>
          <Button title="Save new time" busy={busy} onPress={submitMove} />
        </View>
      </Sheet>}
    </Page>
  );
}
