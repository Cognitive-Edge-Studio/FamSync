"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { components } from "@famsync/api-client";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getBrowserApi } from "@/lib/browser-auth";
import { audienceLabels } from "@/lib/calendar-date";
import { goalModeLabels, goalPath, goalTypeLabels, type GoalDefaults, type GoalDetail } from "@/lib/goals";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";

type Member = components["schemas"]["FamilyMemberDto"];
type CreateGoal = components["schemas"]["CreateGoalDto"];
type Values = {
  title: string; description: string; type: CreateGoal["type"]; category: string; priority: CreateGoal["priority"];
  targetDate: string; assigneeId: string; audience: NonNullable<CreateGoal["audience"]>;
  mode: CreateGoal["mode"]; target: string; unit: string;
};
const textInput = z.object({
  title: z.string().trim().min(1, "Enter a goal title.").max(120),
  description: z.string().trim().max(2000),
});

export function GoalFormDialog({ familyId, accessToken, userId, existing, onClose, onSaved }: {
  familyId: string; accessToken: string; userId: string; existing?: GoalDetail;
  onClose: () => void; onSaved?: (goal: GoalDetail) => void;
}) {
  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<Values>({
    defaultValues: {
      title: existing?.title ?? "", description: existing?.description ?? "", type: existing?.type ?? "family",
      category: existing?.category ?? "Personal Development", priority: existing?.priority ?? "medium",
      targetDate: existing?.targetDate ?? "", assigneeId: existing?.assignee?.userId ?? "",
      audience: existing?.audience ?? "family", mode: existing?.mode ?? "manual",
      target: existing?.target == null ? "" : String(existing.target), unit: existing?.unit ?? "",
    },
  });
  const [defaults, setDefaults] = useState<GoalDefaults>();
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState(existing?.selectedMemberIds ?? []);
  const [draftItems, setDraftItems] = useState(existing?.checklist.map(({ id, label }) => ({ id, label })) ?? []);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const id = useRef("");
  const defaultsApplied = useRef(false);
  const titleField = useRef<HTMLInputElement>(null);
  const [type, mode, audience] = watch(["type", "mode", "audience"]);
  const eligibleMembers = members.filter((member) => audience === "family" || member.userId === userId
    || audience === "selected" && selected.includes(member.userId));

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadError("");
      try {
        const api = getBrowserApi(accessToken);
        const params = { path: { familyId } };
        const [settings, roster] = await Promise.all([
          api.GET("/api/v1/families/{familyId}/goals/defaults", { params, signal: controller.signal }),
          api.GET("/api/v1/families/{familyId}/members", { params, signal: controller.signal }),
        ]);
        if (!settings.data || !roster.data) throw new Error("Goal settings unavailable");
        if (!controller.signal.aborted) {
          setDefaults(settings.data);
          setMembers(roster.data);
          setSelected((ids) => ids.filter((id) => roster.data!.some((member) => member.userId === id)));
          if (!existing && !defaultsApplied.current) {
            setValue("audience", settings.data.audience);
            defaultsApplied.current = true;
          }
        }
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t load the goal settings.");
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, familyId, existing, revision, setValue]);

  function addDraftStep() {
    if (!step.trim() || draftItems.length >= 100) return;
    setDraftItems((items) => [...items, { id: crypto.randomUUID(), label: step.trim() }]);
    setStep("");
  }

  async function save(values: Values) {
    setError("");
    const text = textInput.safeParse(values);
    if (!text.success) { setError(text.error.issues[0].message); return; }
    if (audience === "selected" && !selected.length) { setError("Choose at least one family member."); return; }
    if (type === "individual" && !eligibleMembers.some((member) => member.userId === values.assigneeId)) {
      setError("Choose an assignee who can see this goal."); return;
    }
    if (mode === "numeric" && (!/^\d+(?:\.\d{1,2})?$/.test(values.target) || Number(values.target) <= 0 || !values.unit.trim())) {
      setError("Enter a positive target with up to two decimal places and a unit."); return;
    }
    if (mode === "checklist" && !existing && step.trim()) {
      setError("Add the typed step to the checklist or clear it before saving."); return;
    }
    const details = {
      ...text.data, type: values.type, category: values.category as CreateGoal["category"], priority: values.priority,
      assigneeId: type === "individual" ? values.assigneeId : null, targetDate: values.targetDate || null,
      audience: values.audience, selectedMemberIds: audience === "selected" ? selected : [],
      target: mode === "numeric" ? Number(values.target) : null, unit: mode === "numeric" ? values.unit.trim() : null,
    };
    const fallback = "We couldn’t save the goal. Try again.";
    try {
      const api = getBrowserApi(accessToken);
      id.current ||= crypto.randomUUID();
      const result = existing
        ? await api.PUT("/api/v1/families/{familyId}/goals/{goalId}", {
            params: { path: { familyId, goalId: existing.id } }, body: { ...details, version: existing.version },
          })
        : await api.POST("/api/v1/families/{familyId}/goals", {
            params: { path: { familyId } }, body: { ...details, id: id.current, mode: values.mode,
              ...(mode === "checklist" ? { checklist: draftItems } : {}) },
          });
      if (result.data) {
        if (onSaved) onSaved(result.data);
        else window.location.assign(goalPath(familyId, result.data.id) + "&created=1");
        return;
      }
      setError(familyError([400, 403, 404, 409].includes(result.response.status) ? result.error : undefined, fallback));
    } catch {
      setError(fallback);
    }
  }

  return (
    <Dialog.Root open disablePointerDismissal onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup initialFocus={titleField}
          className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
          <Dialog.Title className="text-lg font-semibold">{existing ? "Edit goal" : "New goal"}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">Choose a goal and how to track its progress.</Dialog.Description>
          <form className="mt-5 grid gap-4" onSubmit={handleSubmit(save)}>
            <fieldset className="grid min-w-0 gap-4" disabled={isSubmitting}>
              <Field id="goal-title" label="Goal title">
                <input id="goal-title" className={inputClass} required maxLength={120} {...register("title")}
                  ref={(node) => { register("title").ref(node); titleField.current = node; }} />
              </Field>
              <Field id="goal-description" label="Description">
                <textarea id="goal-description" className={inputClass} maxLength={2000} rows={3} {...register("description")} />
              </Field>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Field id="goal-type" label="Goal type">
                  <select id="goal-type" className={inputClass} {...register("type")}>
                    {Object.entries(goalTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field id="goal-mode" label="Progress mode">
                  <select id="goal-mode" className={inputClass} {...register("mode")} value={mode} disabled={!!existing}>
                    {(defaults?.modes ?? ["manual", "checklist", "numeric"]).map((value) =>
                      <option key={value} value={value}>{goalModeLabels[value as keyof typeof goalModeLabels]}</option>)}
                  </select>
                </Field>
                <Field id="goal-category" label="Category">
                  <select id="goal-category" className={inputClass} {...register("category")} value={watch("category")}>
                    {(defaults?.categories ?? ["Personal Development"]).map((value) => <option key={value}>{value}</option>)}
                  </select>
                </Field>
                <Field id="goal-priority" label="Priority">
                  <select id="goal-priority" className={inputClass} {...register("priority")}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </Field>
              </div>
              <Field id="goal-target-date" label="Target date">
                <input id="goal-target-date" className={inputClass} type="date" {...register("targetDate")} />
              </Field>
              {mode === "numeric" && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Field id="goal-target" label="Target value">
                  <input id="goal-target" className={inputClass} type="number" min="0.01" max="999999999999.99" step="0.01"
                    required {...register("target")} />
                </Field>
                <Field id="goal-unit" label="Unit">
                  <input id="goal-unit" className={inputClass} maxLength={40} required placeholder="e.g. books" {...register("unit")} />
                </Field>
              </div>}
              {mode === "checklist" && !existing && <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-semibold">Checklist steps</legend>
                <div className="flex min-w-0 gap-2">
                  <input aria-label="New checklist step" className={inputClass} maxLength={120} value={step}
                    onChange={(event) => setStep(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addDraftStep(); } }} />
                  <Button className="h-9 px-3" variant="outline" disabled={!step.trim() || draftItems.length >= 100}
                    onClick={addDraftStep}><Plus aria-hidden="true" />Add step</Button>
                </div>
                {!draftItems.length && <p className="text-sm text-muted-foreground">No checklist items yet.</p>}
                {draftItems.map((item) => <div className="flex items-center gap-2" key={item.id}>
                  <span className="min-w-0 grow wrap-anywhere text-sm">{item.label}</span>
                  <Button variant="ghost" size="icon" aria-label={"Remove " + item.label}
                    onClick={() => setDraftItems((items) => items.filter(({ id }) => id !== item.id))}><Trash2 aria-hidden="true" /></Button>
                </div>)}
              </fieldset>}
              <Field id="goal-audience" label="Who can see this goal?">
                <select id="goal-audience" className={inputClass} {...register("audience")}>
                  {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              {audience === "selected" && <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-semibold">Selected members</legend>
                {members.filter(({ userId: id }) => id !== userId).map((member) => <label key={member.userId} className="flex gap-2 text-sm">
                  <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={selected.includes(member.userId)}
                    onChange={(event) => setSelected((list) => event.target.checked ? [...list, member.userId] : list.filter((id) => id !== member.userId))} />
                  <span className="wrap-anywhere">{[member.firstName, member.lastName].filter(Boolean).join(" ") || "Family member"}</span>
                </label>)}
              </fieldset>}
              {type === "individual" && <Field id="goal-assignee" label="Assignee">
                <select id="goal-assignee" className={inputClass} required {...register("assigneeId")} value={watch("assigneeId")}>
                  <option value="">Choose a family member</option>
                  {eligibleMembers.map((member) => <option key={member.userId} value={member.userId}>
                    {[member.firstName, member.lastName].filter(Boolean).join(" ") || "Family member"}{member.userId === userId ? " (you)" : ""}
                  </option>)}
                </select>
              </Field>}
              <p className="text-sm text-muted-foreground">{audience === "family" ? "Visible to current family members."
                : audience === "private" ? "Visible only to you." : "Visible to you and " + selected.length + " selected members."}</p>
            </fieldset>
            <FormFeedback error={error || loadError} />
            {loadError && <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Try again</Button>}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" className="h-9 px-4" disabled={isSubmitting} />}>Cancel</Dialog.Close>
              <Button type="submit" className="h-9 px-4" disabled={isSubmitting || !defaults || !!loadError}>
                {isSubmitting ? "Saving…" : existing ? "Save changes" : "Create goal"}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
