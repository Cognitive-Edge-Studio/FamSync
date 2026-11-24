import type { components } from "@famsync/api-client";
import { audienceLabels, dayInZone } from "@famsync/core/calendar-date";
import { changedFields, eligibleMembers, goalProblem, memberName, mergeDraft, type GoalDraft } from "@famsync/core/forms";
import { goalModeLabels, goalPriorityLabels, goalTypeLabels, type GoalDefaults, type GoalDetail } from "@famsync/core/goals";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AudienceFields, DateField, ErrorText, Field, Select } from "@/components/form";
import { ConflictNotice, FormPage, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

type CreateGoal = components["schemas"]["CreateGoalDto"];
type Ready = { defaults: GoalDefaults; members: components["schemas"]["FamilyMemberDto"][]; goal?: GoalDetail };
const labels = <T extends string>(values: Record<T, string>) => (Object.keys(values) as T[]).map((value) => ({ value, label: values[value] }));

export default function GoalForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <><Stack.Screen options={{ title: id ? "Edit goal" : "New goal" }} /><WithFamily>{(family) => <Load key={family.id} family={family} id={id} />}</WithFamily></>;
}

function Load({ family, id }: { family: Family; id?: string }) {
  const { access_token } = useSignedIn();
  const load = useCallback(async (signal: AbortSignal): Promise<Ready> => {
    const api = getApi(access_token), path = { familyId: family.id };
    const [defaults, members, goal] = await Promise.all([
      api.GET("/api/v1/families/{familyId}/goals/defaults", { params: { path }, signal }).then(required),
      api.GET("/api/v1/families/{familyId}/members", { params: { path }, signal }).then(required),
      id ? api.GET("/api/v1/families/{familyId}/goals/{goalId}", { params: { path: { ...path, goalId: id } }, signal }).then(required) : undefined,
    ]);
    return { defaults, members, goal };
  }, [access_token, family.id, id]);
  const query = useQuery(family.id, "goal-form:" + (id ?? "new"), load), opened = useRef<Ready>(undefined);
  if (!query.savedAt && query.data && !query.error) opened.current ??= query.data;
  if (opened.current) return <Form family={family} ready={opened.current} />;
  return queryState({ ...query, data: undefined }, { loading: "Opening form…", failed: "The form couldn’t open", lost: "Goal not found" });
}

function draftOf({ goal, defaults }: Ready): GoalDraft {
  return { title: goal?.title ?? "", description: goal?.description ?? "", type: goal?.type ?? "family", category: goal?.category ?? "Personal Development", priority: goal?.priority ?? "medium", targetDate: goal?.targetDate ?? "", assigneeId: goal?.assignee?.userId ?? "",
    audience: goal?.audience ?? defaults.audience, selected: goal?.selectedMemberIds ?? [], mode: goal?.mode ?? "manual", target: goal?.target == null ? "" : String(goal.target), unit: goal?.unit ?? "" };
}

function Form({ family, ready }: { family: Family; ready: Ready }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave(), path = { familyId: family.id };
  const [base, setBase] = useState(ready), [draft, setDraft] = useState(() => draftOf(ready)), [start, setStart] = useState(draft), [conflict, setConflict] = useState<Ready>(), [saved, setSaved] = useState<string>();
  const [steps, setSteps] = useState<{ id: string; label: string }[]>([]), [step, setStep] = useState("");
  const newId = useRef(""), editing = !!base.goal, members = base.members;
  const set = (change: Partial<GoalDraft>) => setDraft((old) => ({ ...old, ...change }));
  const eligible = eligibleMembers(members, draft.audience, draft.selected, user.id);
  useEffect(() => { if (saved === undefined) return; if (editing) router.back(); else router.replace({ pathname: "/goal/[id]", params: { id: saved } }); }, [saved, editing]);

  async function submit(version = base.goal?.version ?? 0, values = draft) {
    const draft = values, problem = goalProblem(draft, eligibleMembers(members, draft.audience, draft.selected, user.id).some((member) => member.userId === draft.assigneeId));
    if (problem) return setError(problem);
    if (!editing && draft.mode === "checklist" && step.trim()) return setError("Add the typed step to the checklist or clear it before saving.");
    newId.current ||= randomUUID();
    const details = { title: draft.title.trim(), description: draft.description.trim(), type: draft.type, category: draft.category as CreateGoal["category"], priority: draft.priority, assigneeId: draft.type === "individual" ? draft.assigneeId : null, targetDate: draft.targetDate || null,
      audience: draft.audience, selectedMemberIds: draft.audience === "selected" ? draft.selected : [], target: draft.mode === "numeric" ? Number(draft.target) : null, unit: draft.mode === "numeric" ? draft.unit.trim() : null };
    const api = getApi(access_token);
    const result = base.goal ? await save(() => api.PUT("/api/v1/families/{familyId}/goals/{goalId}", { params: { path: { ...path, goalId: base.goal!.id } }, body: { ...details, version } }), "We couldn’t save the goal. Try again.")
      : await save(() => api.POST("/api/v1/families/{familyId}/goals", { params: { path }, body: { ...details, id: newId.current, mode: draft.mode, ...(draft.mode === "checklist" ? { checklist: steps } : {}) } }), "We couldn’t save the goal. Try again.");
    if (result.ok) { setConflict(undefined); setSaved(result.data.id); return; }
    if (!result.conflict || !base.goal) return;
    try { setConflict({ ...base, goal: required(await api.GET("/api/v1/families/{familyId}/goals/{goalId}", { params: { path: { ...path, goalId: base.goal.id } } })) }); } catch { /* The server's message explains the conflict. */ }
  }
  const person = (id: string) => { const member = members.find((item) => item.userId === id); return member ? memberName(member) : id ? "Former member" : "Nobody"; };
  const changes = conflict ? changedFields(draftOf(base), draftOf(conflict), { title: "Title", description: "Description", type: "Type", category: "Category", priority: "Priority", targetDate: "Target date", assigneeId: "Assigned to", audience: "Who can see it", selected: "Selected members", target: "Target", unit: "Unit" })
    .map(({ key, label, value }) => ({ label, value: key === "assigneeId" ? person(String(value)) : key === "audience" ? audienceLabels[value as GoalDraft["audience"]] : key === "selected" ? (value as string[]).map(person).join(", ") : key === "type" ? goalTypeLabels[value as GoalDraft["type"]] : key === "priority" ? goalPriorityLabels[value as GoalDraft["priority"]] : String(value ?? "") })) : [];
  return (
    <FormPage dirty={saved === undefined && (JSON.stringify(draft) !== JSON.stringify(start) || steps.length > 0 || !!step.trim())} busy={busy} title={editing ? "Save changes" : "Create goal"} onSave={() => void submit()} error={<ErrorText>{conflict ? "" : error}</ErrorText>}
      notice={conflict && <ConflictNotice changes={changes} onKeepMine={() => { const latest = conflict, merged = mergeDraft(draftOf(base), draft, draftOf(latest)); setBase(latest); setDraft(merged); setStart(draftOf(latest)); setConflict(undefined); void submit(latest.goal?.version, merged); }} onUseLatest={() => { const latest = draftOf(conflict); setBase(conflict); setDraft(latest); setStart(latest); setConflict(undefined); setError(""); }} />}>
      <Field label="Goal title" value={draft.title} maxLength={120} onChangeText={(title) => set({ title })} />
      <Field label="Description" value={draft.description} maxLength={2000} multiline onChangeText={(description) => set({ description })} />
      <Select label="Type" value={draft.type} onChange={(type) => set({ type })} choices={labels(goalTypeLabels)} />
      <Select label="Category" value={draft.category} onChange={(category: string) => set({ category })} choices={base.defaults.categories.map((value) => ({ value, label: value }))} />
      <Select label="Priority" value={draft.priority} onChange={(priority) => set({ priority })} choices={labels(goalPriorityLabels)} />
      <DateField label="Target date (optional)" value={draft.targetDate} today={dayInZone(new Date(), family.timeZone)} optional onChange={(targetDate) => set({ targetDate })} />
      {editing ? <Card><Text muted size={13}>Tracked by</Text><Text>{goalModeLabels[draft.mode]}</Text></Card> : <Select label="Track progress by" value={draft.mode} onChange={(mode) => set({ mode })} choices={labels(goalModeLabels)} />}
      {draft.mode === "numeric" && <><Field label="Target" value={draft.target} keyboardType="decimal-pad" onChangeText={(target) => set({ target })} /><Field label="Unit" value={draft.unit} maxLength={40} placeholder="miles, books, dollars" onChangeText={(unit) => set({ unit })} /></>}
      {draft.mode === "checklist" && !editing && <Card>
        <Text weight="600">Steps</Text>
        {steps.map((entry) => <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ flex: 1 }}>{entry.label}</Text><Button variant="outline" title="Remove" onPress={() => setSteps(steps.filter((value) => value.id !== entry.id))} /></View>)}
        <Field label="New step" value={step} maxLength={120} onChangeText={setStep} />
        <Button variant="outline" title="Add step" disabled={steps.length >= 100} onPress={() => { if (!step.trim()) return; setSteps([...steps, { id: randomUUID(), label: step.trim() }]); setStep(""); }} />
      </Card>}
      <AudienceFields noun="goal" audience={draft.audience} selected={draft.selected} members={members} me={user.id} onAudience={(audience) => set({ audience })} onSelected={(selected) => set({ selected })} />
      {draft.type === "individual" && <Select label="Assigned to" value={draft.assigneeId} onChange={(assigneeId: string) => set({ assigneeId })} choices={eligible.map((member) => ({ value: member.userId, label: memberName(member) + (member.userId === user.id ? " (me)" : "") }))} />}
    </FormPage>
  );
}
