import type { components } from "@famsync/api-client";
import { dayInZone, eventTime, formatDay } from "@famsync/core/calendar-date";
import { audienceProblem, readSchedule, type Audience, type ScheduleDraft } from "@famsync/core/forms";
import { parseReminder, reminderLabel, reminderMinutes } from "@famsync/core/reminders";
import { repeatUnit } from "@famsync/core/tasks";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudienceFields, DateField, ErrorText, Field, Row, Select, TimeField } from "@/components/form";
import { FormPage, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { PickFiles } from "@/components/pick-files";
import { getApi, required } from "@/lib/api";
import { attachmentProblem, uploadFile, type Picked } from "@/lib/attachments";
import type { Family } from "@/lib/family";
import { textForm } from "@/lib/multipart";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

type Frequency = "" | "daily" | "weekly" | "monthly";
export default function EventForm() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  return <><Stack.Screen options={{ title: "New event" }} /><WithFamily>{(family) => <Form key={family.id} family={family} day={day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : dayInZone(new Date(), family.timeZone)} />}</WithFamily></>;
}

function Form({ family, day }: { family: Family; day: string }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave(), previewing = useSave(), path = { familyId: family.id };
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), params = { path: { familyId: family.id } };
    const [defaults, members] = await Promise.all([api.GET("/api/v1/families/{familyId}/events/defaults", { params, signal }).then(required), api.GET("/api/v1/families/{familyId}/members", { params, signal }).then(required)]);
    return { audience: defaults.audience, members };
  }, [access_token, family.id]);
  const query = useQuery(family.id, "event-form", load);
  const [text, setText] = useState({ title: "", location: "", note: "" }), [schedule, setSchedule] = useState<ScheduleDraft>({ allDay: false, startDate: day, startTime: "09:00", endDate: day, endTime: "10:00" });
  const [audience, setAudience] = useState<Audience>(), [selected, setSelected] = useState<string[]>([]), [remind, setRemind] = useState(""), [remindAudience, setRemindAudience] = useState<"me" | "everyone">("me");
  const [repeat, setRepeat] = useState({ frequency: "" as Frequency, interval: "1", until: "" }), [preview, setPreview] = useState<components["schemas"]["RecurrencePreviewDto"]>(), [touched, setTouched] = useState(false), [saved, setSaved] = useState<{ id: string; occurrence?: string }>();
  const id = useRef(""), [file, setFile] = useState<Picked>(), [picking, setPicking] = useState(false), [sending, setSending] = useState<number>();
  useEffect(() => { if (saved) router.replace({ pathname: "/event/[id]", params: saved }); }, [saved]);
  const state = queryState(query, { loading: "Opening form…", failed: "The form couldn’t open", lost: "You no longer have access" });
  if (state || !query.data) return state;
  const chosen = audience ?? query.data.audience, change = (run: () => void) => { run(); setTouched(true); setPreview(undefined); };
  const when = (value: Partial<ScheduleDraft>) => change(() => setSchedule((old) => {
    const next = { ...old, ...value };
    // Moving the start past the end brings the end along, as most people expect.
    return next.endDate < next.startDate ? { ...next, endDate: next.startDate } : next;
  }));
  function read() {
    const result = readSchedule(schedule);
    if ("problem" in result) return result.problem;
    if (!repeat.frequency) return { schedule: result.schedule, recurrence: undefined };
    const interval = Number(repeat.interval);
    if (!repeat.until || !Number.isInteger(interval) || interval < 1 || interval > 2147483647) return "Enter a repeat end date and a positive whole-number interval.";
    return { schedule: result.schedule, recurrence: { frequency: repeat.frequency, interval, until: repeat.until } };
  }
  async function showPreview() {
    setPreview(undefined);
    const values = read();
    if (typeof values === "string") return setError(values);
    setError("");
    const result = await previewing.save(() => getApi(access_token).POST("/api/v1/families/{familyId}/events/preview", { params: { path }, body: { ...values.schedule, recurrence: values.recurrence! } }), "We couldn’t preview the schedule. Try again.");
    if (result.ok) setPreview(result.data);
  }
  async function submit() {
    if (!text.title.trim()) return setError("Enter an event title.");
    const problem = audienceProblem(chosen, selected), values = read();
    if (problem) return setError(problem);
    if (typeof values === "string") return setError(values);
    id.current ||= randomUUID();
    const reminder = parseReminder(remind), input = { id: id.current, title: text.title.trim(), location: text.location, note: text.note, ...values.schedule, recurrence: values.recurrence, audience: chosen, selectedMemberIds: chosen === "selected" ? selected : [], remindMinutes: reminder, remindAudience: reminder === null ? undefined : remindAudience };
    if (file) {
      setSending(0); setError("");
      try {
        const made = await uploadFile<{ id: string; occurrence?: { originalDate: string } | null }>({ path: "/api/v1/families/" + family.id + "/events", fields: { event: JSON.stringify(input) }, file, token: access_token, signal: new AbortController().signal, onProgress: setSending });
        setSaved({ id: made.id, ...(made.occurrence ? { occurrence: made.occurrence.originalDate } : {}) });
      } catch (problem) { setError(problem instanceof Error ? problem.message : "We couldn’t save the event. Try again."); } finally { setSending(undefined); }
      return;
    }
    const form = textForm({ event: JSON.stringify(input) }, "famsync-" + randomUUID());
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/events", { params: { path }, body: { event: "" }, bodySerializer: () => form.body, headers: { "Content-Type": form.contentType } }), "We couldn’t save the event. Try again.");
    if (result.ok) setSaved({ id: result.data.id, ...(result.data.occurrence ? { occurrence: result.data.occurrence.originalDate } : {}) });
  }
  return (
    <FormPage dirty={touched && !saved} busy={busy || sending !== undefined} title="Create event" onSave={() => void submit()} error={<ErrorText>{error || previewing.error}</ErrorText>}>
      <Field label="Event title" value={text.title} maxLength={120} onChangeText={(title) => change(() => setText({ ...text, title }))} />
      <Row multiple title="All day" selected={schedule.allDay} onPress={() => when({ allDay: !schedule.allDay })} />
      <DateField label="Start date" value={schedule.startDate} today={day} onChange={(startDate) => when({ startDate })} />
      {!schedule.allDay && <TimeField label="Start time" value={schedule.startTime} onChange={(startTime) => when({ startTime })} />}
      <DateField label={schedule.allDay ? "Last day" : "End date"} value={schedule.endDate} today={day} onChange={(endDate) => when({ endDate })} />
      {!schedule.allDay && <TimeField label="End time" value={schedule.endTime} onChange={(endTime) => when({ endTime })} />}
      <Text muted size={13}>{"Times use " + family.timeZone + "."}</Text>
      <Select label="Repeat" value={repeat.frequency} onChange={(frequency: Frequency) => change(() => setRepeat({ ...repeat, frequency }))} choices={[{ value: "", label: "Does not repeat" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
      {repeat.frequency !== "" && <Card>
        <Field label={"Repeat every (" + repeatUnit(repeat.frequency) + ")"} value={repeat.interval} keyboardType="number-pad" maxLength={10} onChangeText={(interval) => change(() => setRepeat({ ...repeat, interval }))} />
        <DateField label="Repeat through" value={repeat.until} today={day} onChange={(until) => change(() => setRepeat({ ...repeat, until }))} />
        <Button variant="outline" title="Preview dates" busy={previewing.busy} onPress={() => void showPreview()} />
        {preview?.occurrences.map((item, index) => { const event = { ...item, allDay: schedule.allDay }; return <Text key={index} muted>{formatDay(schedule.allDay ? item.start : dayInZone(new Date(item.start), preview.timeZone)) + ", " + eventTime(event, preview.timeZone)}</Text>; })}
        {preview?.hasMore && <Text muted>More dates follow.</Text>}
      </Card>}
      <Field label="Location" value={text.location} maxLength={200} onChangeText={(location) => change(() => setText({ ...text, location }))} />
      <Field label="Note" value={text.note} maxLength={2000} multiline onChangeText={(note) => change(() => setText({ ...text, note }))} />
      <AudienceFields noun="event" audience={chosen} selected={selected} members={query.data.members} me={user.id} onAudience={(value) => change(() => setAudience(value))} onSelected={(ids) => change(() => setSelected(ids))} />
      <Select label="Reminder" value={remind} onChange={(value: string) => change(() => setRemind(value))} choices={[{ value: "", label: "No reminder" }, ...reminderMinutes.map((minutes) => ({ value: String(minutes), label: reminderLabel(minutes, schedule.allDay) }))]} />
      {remind !== "" && chosen !== "private" && <Select label="Remind" value={remindAudience} onChange={(value) => change(() => setRemindAudience(value))} choices={[{ value: "me", label: "Only me" }, { value: "everyone", label: "Everyone who can see it" }]} />}
      {file ? <Card><Text>{file.name}</Text>{sending !== undefined && <Text muted accessibilityLiveRegion="polite">{"Uploading " + sending + "%"}</Text>}<Button variant="outline" title="Remove file" disabled={sending !== undefined} onPress={() => change(() => setFile(undefined))} /></Card> : <Button variant="outline" title="Attach a file" onPress={() => setPicking(true)} />}
      {picking && <PickFiles title="Attach a file" limit={1} note="Up to 5 MB. Everyone who can see the event can open it." onClose={() => setPicking(false)} onError={setError} onPicked={(files) => { setPicking(false); const problem = files[0] && attachmentProblem(files[0]); if (problem) setError(problem); else if (files[0]) change(() => setFile(files[0])); }} />}
    </FormPage>
  );
}
