import type { components } from "@famsync/api-client";
import { audienceLabels, dayInZone, eventDays, formatDay, shiftDay } from "@famsync/core/calendar-date";
import { changedFields, eligibleMembers, memberName, mergeDraft, repeatProblem, taskProblem, type TaskDraft } from "@famsync/core/forms";
import { defaultTaskReminder, parseReminder, reminderLabel, reminderMinutes } from "@famsync/core/reminders";
import { repeatUnit, taskSuggestions, type TaskDetail, type TaskSeries } from "@famsync/core/tasks";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudienceFields, DateField, ErrorText, Field, Select, TimeField } from "@/components/form";
import { ConflictNotice, FormPage, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

type Member = components["schemas"]["FamilyMemberDto"];
type Link = NonNullable<TaskDraft["eventLink"]> & { day?: string };
type Params = { id?: string; series?: string; event?: string; occurrence?: string; day?: string; label?: string };
type Ready = { members: Member[]; audience: TaskDraft["audience"]; links: Link[]; task?: TaskDetail; series?: TaskSeries };
const linkKey = (link: Pick<Link, "eventId" | "occurrenceDate">) => link.eventId + "|" + (link.occurrenceDate ?? "");

export default function TaskForm() {
  const params = useLocalSearchParams<Params>();
  return <><Stack.Screen options={{ title: params.series ? "Edit chore" : params.id ? "Edit task" : "New task" }} /><WithFamily>{(family) => <Load key={family.id} family={family} params={params} />}</WithFamily></>;
}

function Load({ family, params }: { family: Family; params: Params }) {
  const { access_token } = useSignedIn();
  const load = useCallback(async (signal: AbortSignal): Promise<Ready> => {
    const api = getApi(access_token), path = { familyId: family.id }, start = dayInZone(new Date(), family.timeZone);
    const [defaults, members, events, task, series] = await Promise.all([
      api.GET("/api/v1/families/{familyId}/tasks/defaults", { params: { path }, signal }).then(required),
      api.GET("/api/v1/families/{familyId}/members", { params: { path }, signal }).then(required),
      params.series ? undefined : api.GET("/api/v1/families/{familyId}/events", { params: { path, query: { start, end: shiftDay(start, 42) } }, signal }).then(({ data }) => data),
      params.id ? api.GET("/api/v1/families/{familyId}/tasks/{taskId}", { params: { path: { ...path, taskId: params.id } }, signal }).then(required) : undefined,
      params.series ? api.GET("/api/v1/families/{familyId}/task-series/{seriesId}", { params: { path: { ...path, seriesId: params.series } }, signal }).then(required) : undefined,
    ]);
    const links = events?.events.map((event): Link => { const day = eventDays(event, events.timeZone).first; return { eventId: event.id, occurrenceDate: event.occurrence?.originalDate ?? null, day, label: event.title + " · " + formatDay(day) }; }) ?? [];
    return { members, audience: defaults.audience, links, task, series };
  }, [access_token, family.id, family.timeZone, params.id, params.series]);
  const query = useQuery(family.id, "task-form:" + (params.id ?? params.series ?? "new"), load);
  // The form keeps what it opened with; later refreshes must not replace what is being typed.
  const opened = useRef<Ready>(undefined);
  if (!query.savedAt && query.data && !query.error) opened.current ??= query.data;
  if (opened.current) return <Form family={family} params={params} ready={opened.current} />;
  // Saved data is not enough to edit from: its version may be old.
  return queryState({ ...query, data: undefined }, { loading: "Opening form…", failed: "The form couldn’t open", lost: "Task not found" });
}

function draftOf(ready: Ready, params: Params): TaskDraft {
  const source = ready.series ?? ready.task;
  return {
    title: source?.title ?? "", description: source?.description ?? "", dueDate: ready.task?.dueDate ?? params.day ?? "", dueTime: source?.dueTime ?? "",
    assigneeId: source?.assignee?.current ? source.assignee.userId : "", audience: source?.audience ?? ready.audience, selected: source?.selectedMemberIds ?? [],
    remind: source ? String(source.remindMinutes ?? "") : "auto", frequency: ready.series?.frequency ?? "", interval: String(ready.series?.interval ?? 1), until: ready.series?.until ?? "",
    eventLink: params.event ? { eventId: params.event, occurrenceDate: params.occurrence ?? null, label: params.label ?? "This event" }
      : ready.task?.eventLink ? { eventId: ready.task.eventLink.eventId, occurrenceDate: ready.task.eventLink.occurrenceDate ?? null, label: ready.task.eventLink.title } : null,
  };
}

function Form({ family, params, ready }: { family: Family; params: Params; ready: Ready }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave();
  const [base, setBase] = useState(ready), [draft, setDraft] = useState(() => draftOf(ready, params)), [start, setStart] = useState(draft);
  const [conflict, setConflict] = useState<Ready>(), [preview, setPreview] = useState<{ dates: string[]; hasMore: boolean }>(), [saved, setSaved] = useState<string>();
  const newId = useRef(params.id ?? params.series ?? ""), previewing = useSave();
  const set = (change: Partial<TaskDraft>) => { setDraft((old) => ({ ...old, ...change })); setPreview(undefined); };
  const creating = !base.task && !base.series, repeating = !!draft.frequency, today = dayInZone(new Date(), family.timeZone), members = base.members;
  const eligible = eligibleMembers(members, draft.audience, draft.selected, user.id), hasDue = !!base.series || !!draft.dueDate;
  const remind = draft.remind === "auto" ? String(defaultTaskReminder(draft.dueDate, draft.dueTime) ?? "") : draft.remind;
  const path = { familyId: family.id };
  // Leaving happens after the form is no longer marked as unsaved.
  useEffect(() => { if (saved === undefined) return; if (saved && creating) router.replace({ pathname: "/task/[id]", params: { id: saved } }); else router.back(); }, [saved, creating]);

  async function submit(version = base.series?.version ?? base.task?.version ?? 0, values = draft) {
    const draft = values, visible = eligibleMembers(members, draft.audience, draft.selected, user.id), dueSet = !!base.series || !!draft.dueDate, reminder = draft.remind === "auto" ? String(defaultTaskReminder(draft.dueDate, draft.dueTime) ?? "") : draft.remind;
    const problem = taskProblem(draft, base.series ? "series" : "task", visible.some((member) => member.userId === draft.assigneeId), base.series?.startDate);
    if (problem) return setError(problem);
    newId.current ||= randomUUID();
    const api = getApi(access_token), shared = {
      title: draft.title.trim(), description: draft.description, dueTime: draft.dueTime || null, assigneeId: draft.assigneeId || null, audience: draft.audience,
      selectedMemberIds: draft.audience === "selected" ? draft.selected : [], remindMinutes: dueSet ? parseReminder(reminder) : null,
    };
    const eventLink = draft.eventLink && !draft.frequency ? { eventId: draft.eventLink.eventId, occurrenceDate: draft.eventLink.occurrenceDate } : null;
    const fallback = "We couldn’t save the task. Try again.";
    const result = base.series ? await save(() => api.PUT("/api/v1/families/{familyId}/task-series/{seriesId}", { params: { path: { ...path, seriesId: base.series!.id } }, body: { ...shared, until: draft.until || null, version } }), fallback)
      : base.task ? await save(() => api.PUT("/api/v1/families/{familyId}/tasks/{taskId}", { params: { path: { ...path, taskId: base.task!.id } }, body: { ...shared, dueDate: draft.dueDate || null, eventLink, version } }), fallback)
      : draft.frequency ? await save(() => api.POST("/api/v1/families/{familyId}/task-series", { params: { path }, body: { id: newId.current, ...shared, startDate: draft.dueDate, recurrence: { frequency: draft.frequency as "daily", interval: Number(draft.interval), until: draft.until || null } } }), fallback)
      : await save(() => api.POST("/api/v1/families/{familyId}/tasks", { params: { path }, body: { id: newId.current, ...shared, dueDate: draft.dueDate || null, eventLink } }), fallback);
    if (result.ok) { setConflict(undefined); setSaved(creating && !repeating ? result.data.id : ""); return; }
    if (!result.conflict || creating) return;
    // Show what is saved now. The person decides; nothing they typed changes.
    try {
      const latest = base.series ? { series: required(await api.GET("/api/v1/families/{familyId}/task-series/{seriesId}", { params: { path: { ...path, seriesId: base.series.id } } })) }
        : { task: required(await api.GET("/api/v1/families/{familyId}/tasks/{taskId}", { params: { path: { ...path, taskId: base.task!.id } } })) };
      setConflict({ ...base, ...latest });
    } catch { /* The server's message explains the conflict. */ }
  }
  async function showPreview() {
    setPreview(undefined);
    const problem = repeatProblem(draft);
    if (problem) return setError(problem);
    setError("");
    const result = await previewing.save(() => getApi(access_token).POST("/api/v1/families/{familyId}/task-series/preview", { params: { path }, body: { startDate: draft.dueDate, recurrence: { frequency: draft.frequency as "daily", interval: Number(draft.interval), until: draft.until || null } } }), "We couldn’t preview the dates.");
    if (result.ok) setPreview(result.data);
  }
  const person = (id: string) => { const member = members.find((item) => item.userId === id); return member ? memberName(member) : id ? "Former member" : "Nobody"; };
  const changes = conflict ? changedFields(draftOf(base, {}), draftOf(conflict, {}), { title: "Title", description: "Description", dueDate: "Due date", dueTime: "Due time", assigneeId: "Assigned to", audience: "Who can see it", selected: "Selected members", remind: "Reminder", until: "Repeat through", eventLink: "Linked event" })
    .map(({ key, label, value }) => ({ label, value: key === "assigneeId" ? person(String(value)) : key === "audience" ? audienceLabels[value as TaskDraft["audience"]] : key === "selected" ? (value as string[]).map(person).join(", ") : key === "eventLink" ? (value as Link | null)?.label ?? "" : key === "remind" ? (value === "" ? "No reminder" : reminderLabel(Number(value) as 0, !draftOf(conflict, {}).dueTime)) : String(value ?? "") })) : [];
  const links = [...(draft.eventLink && !base.links.some((link) => linkKey(link) === linkKey(draft.eventLink!)) ? [draft.eventLink as Link] : []), ...base.links];
  return (
    <FormPage dirty={saved === undefined && JSON.stringify(draft) !== JSON.stringify(start)} busy={busy} title={creating ? "Create task" : "Save changes"} onSave={() => void submit()} error={<ErrorText>{conflict ? "" : error || previewing.error}</ErrorText>}
      notice={conflict && <ConflictNotice changes={changes} onKeepMine={() => { const latest = conflict, merged = mergeDraft(draftOf(base, {}), draft, draftOf(latest, {})); setBase(latest); setDraft(merged); setStart(draftOf(latest, {})); setConflict(undefined); void submit(latest.series?.version ?? latest.task?.version, merged); }}
        onUseLatest={() => { const latest = draftOf(conflict, {}); setBase(conflict); setDraft(latest); setStart(latest); setConflict(undefined); setError(""); }} />}>
      <Text muted>{base.series ? "Changes apply to upcoming occurrences and open ones not edited separately. Completed ones keep their history." : base.task?.series ? "Changes apply only to this occurrence." : "Due dates use " + family.timeZone + "."}</Text>
      {creating && <Select label="Suggested title" value="" empty="Choose a suggestion (optional)" onChange={(title: string) => set({ title })} choices={taskSuggestions.flatMap(({ group, titles }) => titles.map((title) => ({ value: title, label: title, group })))} />}
      <Field label="Task title" value={draft.title} maxLength={120} onChangeText={(title) => set({ title })} />
      <Field label="Description" value={draft.description} maxLength={2000} multiline onChangeText={(description) => set({ description })} />
      {creating && <Select label="Repeat" value={draft.frequency} onChange={(frequency) => set({ frequency })} choices={[{ value: "", label: "Does not repeat" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />}
      {base.series ? <Card><Text muted size={13}>First due date</Text><Text>{formatDay(base.series.startDate)}</Text></Card> : <DateField label={repeating ? "First due date" : "Due date"} value={draft.dueDate} today={today} optional={!repeating} onChange={(dueDate) => set({ dueDate, ...(dueDate ? {} : { dueTime: "" }) })} />}
      <TimeField label="Due time (optional)" value={draft.dueTime} editable={hasDue} onChange={(dueTime) => set({ dueTime })} />
      {(repeating || base.series) && <Card>
        {creating && <Field label={"Repeat every (" + repeatUnit(draft.frequency as "daily") + ")"} value={draft.interval} keyboardType="number-pad" maxLength={3} onChangeText={(interval) => set({ interval })} />}
        <DateField label="Repeat through (optional)" value={draft.until} today={today} optional onChange={(until) => set({ until })} />
        {creating && <Button variant="outline" title="Preview dates" busy={previewing.busy} onPress={() => void showPreview()} />}
        {preview && <>{preview.dates.map((date) => <Text key={date} muted>{formatDay(date)}</Text>)}{preview.hasMore && <Text muted>More due dates follow.</Text>}</>}
      </Card>}
      {!base.series && !repeating && <Select label="Linked event (optional)" value={draft.eventLink ? linkKey(draft.eventLink) : ""} choices={[{ value: "", label: "No linked event" }, ...links.map((link) => ({ value: linkKey(link), label: link.label }))]}
        onChange={(key: string) => { const link = links.find((item) => linkKey(item) === key) ?? null; set({ eventLink: link && { eventId: link.eventId, occurrenceDate: link.occurrenceDate, label: link.label }, ...(link?.day && !draft.dueDate ? { dueDate: link.day } : {}) }); }} />}
      <AudienceFields noun="task" audience={draft.audience} selected={draft.selected} members={members} me={user.id} onAudience={(audience) => set({ audience })} onSelected={(selected) => set({ selected })} />
      <Select label="Assigned to" value={draft.assigneeId} onChange={(assigneeId: string) => set({ assigneeId })} empty={person(draft.assigneeId)} choices={[{ value: "", label: "Nobody" }, ...eligible.map((member) => ({ value: member.userId, label: memberName(member) + (member.userId === user.id ? " (me)" : "") }))]} />
      {hasDue && <Select label="Reminder" value={remind} onChange={(value: string) => set({ remind: value })} choices={[{ value: "", label: "No reminder" }, ...reminderMinutes.map((minutes) => ({ value: String(minutes), label: reminderLabel(minutes, !draft.dueTime) }))]} />}
    </FormPage>
  );
}
