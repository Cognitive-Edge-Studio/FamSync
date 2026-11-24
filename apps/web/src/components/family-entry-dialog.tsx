"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { audienceLabels } from "@/lib/calendar-date";
import { entryKinds, universeGroups, type EntryKind, type EntryLinkKind, type FamilyBaseGraph, type FamilyEntry } from "@/lib/family-base";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Button } from "./ui/button";
import { Segmented } from "./ui/segmented";

type Choice = { kind: EntryLinkKind; id: string; name: string; label: string };
const linkLabels: Record<EntryLinkKind, string> = { person: "Person", goal: "Goal", event: "Event", entry: "Entry" };
const prompts: Record<EntryKind, string> = {
  memory: "A moment worth keeping.", place: "Somewhere that matters to your family.", idea: "Something to try, make or talk about.",
};

/** Everything in the graph an entry can link to, except itself. */
function choicesFrom(graph: FamilyBaseGraph, entryId?: string): Choice[] {
  return graph.nodes.flatMap((node): Choice[] => {
    const kind = node.kind === "person" || node.kind === "goal" || node.kind === "event" ? node.kind
      : (entryKinds as readonly string[]).includes(node.kind) ? "entry" : null;
    if (!kind || node.recordId === entryId) return [];
    return [{ kind, id: node.recordId, name: node.name, label: universeGroups.find((group) => group.id === node.kind)!.singular }];
  });
}
const choiceKey = (choice: { kind: string; id: string }) => choice.kind + ":" + choice.id;

export function FamilyEntryDialog({ graph, familyId, accessToken, entryId, onClose, onSaved }: {
  graph: FamilyBaseGraph; familyId: string; accessToken: string; entryId?: string;
  onClose: () => void; onSaved: (entry: FamilyEntry) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [existing, setExisting] = useState<FamilyEntry>();
  const [kind, setKind] = useState<EntryKind>("memory");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [happenedOn, setHappenedOn] = useState("");
  const [location, setLocation] = useState("");
  const [audience, setAudience] = useState<FamilyEntry["audience"]>("family");
  const [members, setMembers] = useState<string[]>([]);
  const [links, setLinks] = useState<Choice[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const newId = useRef("");
  const token = useRef(accessToken);
  token.current = accessToken;
  const titleField = useRef<HTMLInputElement>(null);
  const people = graph.nodes.filter((node) => node.kind === "person" && !node.you);
  const currentMembers = members.filter((id) => people.some((person) => person.recordId === id));

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    async function load() {
      try {
        const api = getBrowserApi(token.current);
        if (entryId) {
          const { data } = await api.GET("/api/v1/families/{familyId}/base/entries/{entryId}", { params: { path: { familyId, entryId } }, signal: controller.signal });
          if (!data) throw new Error("Entry unavailable");
          if (controller.signal.aborted) return;
          setExisting(data); setKind(data.kind); setTitle(data.title); setNote(data.note); setHappenedOn(data.happenedOn ?? "");
          setLocation(data.location); setAudience(data.audience); setMembers(data.selectedMemberIds);
          setLinks(data.links.map((link) => ({ ...link, label: linkLabels[link.kind] })));
        } else {
          const { data } = await api.GET("/api/v1/families/{familyId}/base/entries/defaults", { params: { path: { familyId } }, signal: controller.signal });
          if (!data) throw new Error("Defaults unavailable");
          if (controller.signal.aborted) return;
          setAudience(data.audience);
        }
        setLoaded(true);
      } catch {
        if (!controller.signal.aborted) setLoadError("We couldn’t open this form.");
      }
    }
    void load();
    return () => controller.abort();
  }, [familyId, entryId, revision]);

  const chosen = new Set(links.map(choiceKey));
  const choices = choicesFrom(graph, entryId);
  const known = new Set(choices.map(choiceKey));
  // Saved links can point at records the graph leaves out, such as an archived goal.
  const all = [...links.filter((link) => !known.has(choiceKey(link))), ...choices];
  const term = filter.trim().toLocaleLowerCase();
  const shown = all.filter((choice) => !term || choice.name.toLocaleLowerCase().includes(term))
    .sort((a, b) => Number(chosen.has(choiceKey(b))) - Number(chosen.has(choiceKey(a))));

  function toggle(choice: Choice, on: boolean) {
    setLinks((current) => on ? [...current, choice] : current.filter((link) => choiceKey(link) !== choiceKey(choice)));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!title.trim()) { setError("Enter a title."); return; }
    if (audience === "selected" && !currentMembers.length) { setError("Choose at least one family member."); return; }
    setBusy(true);
    newId.current ||= crypto.randomUUID();
    const fields = {
      kind, title: title.trim(), note: note.trim(), happenedOn: kind === "memory" && happenedOn ? happenedOn : null,
      location: kind === "place" ? location.trim() : "", audience, selectedMemberIds: audience === "selected" ? currentMembers : [],
      links: links.map((link) => ({ kind: link.kind, id: link.id })),
    };
    const fallback = "We couldn’t save this. Try again.";
    try {
      const api = getBrowserApi(token.current);
      const result = existing
        ? await api.PUT("/api/v1/families/{familyId}/base/entries/{entryId}", { params: { path: { familyId, entryId: existing.id } }, body: { ...fields, version: existing.version } })
        : await api.POST("/api/v1/families/{familyId}/base/entries", { params: { path: { familyId } }, body: { ...fields, id: newId.current } });
      if (result.data) { onSaved(result.data); return; }
      setError(familyError([400, 403, 404, 409].includes(result.response.status) ? result.error : undefined, fallback));
    } catch {
      setError(fallback);
    }
    setBusy(false);
  }

  return (
    <Dialog.Root open disablePointerDismissal onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup initialFocus={titleField}
          className="transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl sm:p-6">
          <Dialog.Title className="text-lg font-semibold">{entryId ? "Edit entry" : "Add to Family Base"}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">{prompts[kind]}</Dialog.Description>
          <form className="mt-5 grid gap-4" onSubmit={(event) => void save(event)}>
            <fieldset className="grid min-w-0 gap-4" disabled={busy || !loaded}>
              <Segmented label="Kind" value={kind} onChange={setKind} className="w-fit"
                options={[{ value: "memory", label: "Memory" }, { value: "place", label: "Place" }, { value: "idea", label: "Idea" }]} />
              <Field id="entry-title" label="Title">
                <input id="entry-title" ref={titleField} className={inputClass} required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              {kind === "memory" && <Field id="entry-date" label="When did it happen? (optional)">
                <input id="entry-date" type="date" className={inputClass} value={happenedOn} onChange={(event) => setHappenedOn(event.target.value)} />
              </Field>}
              {kind === "place" && <Field id="entry-location" label="Where is it? (optional)">
                <input id="entry-location" className={inputClass} maxLength={200} value={location} onChange={(event) => setLocation(event.target.value)} />
              </Field>}
              <Field id="entry-note" label="Note (optional)">
                <textarea id="entry-note" className={inputClass} rows={4} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
              <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-semibold">Linked to {links.length > 0 && `(${links.length})`}</legend>
                <input aria-label="Filter people, goals, events and entries" className={inputClass} placeholder="Filter people, goals, events and entries…" value={filter}
                  onChange={(event) => setFilter(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
                <ul className="grid max-h-44 gap-0.5 overflow-y-auto">
                  {shown.map((choice) => <li key={choiceKey(choice)}><label className="flex min-h-9 items-center gap-2 rounded-lg px-1 text-sm hover:bg-accent">
                    <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={chosen.has(choiceKey(choice))}
                      disabled={!chosen.has(choiceKey(choice)) && links.length >= 50} onChange={(event) => toggle(choice, event.target.checked)} />
                    <span className="min-w-0 grow wrap-anywhere">{choice.name}</span><span className="shrink-0 text-xs text-muted-foreground">{choice.label}</span>
                  </label></li>)}
                  {!shown.length && <li className="py-1 text-sm text-muted-foreground">Nothing found</li>}
                </ul>
              </fieldset>
              <Field id="entry-audience" label="Who can see this?">
                <select id="entry-audience" className={inputClass} value={audience} onChange={(event) => setAudience(event.target.value as FamilyEntry["audience"])}>
                  {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              {audience === "selected" && <fieldset className="grid min-w-0 gap-2 rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-semibold">Selected members</legend>
                {people.map((person) => <label key={person.recordId} className="flex gap-2 text-sm">
                  <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={members.includes(person.recordId)}
                    onChange={(event) => setMembers((list) => event.target.checked ? [...list, person.recordId] : list.filter((id) => id !== person.recordId))} />
                  <span className="wrap-anywhere">{person.name}</span>
                </label>)}
              </fieldset>}
              <p className="text-sm text-muted-foreground">Linking doesn’t share anything. People only see a link when they can already see both ends.</p>
            </fieldset>
            <FormFeedback error={error || loadError} />
            {loadError && <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Try again</Button>}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close render={<Button variant="outline" className="h-9 px-4" disabled={busy} />}>Cancel</Dialog.Close>
              <Button type="submit" className="h-9 px-4" disabled={busy || !loaded}>{busy ? "Saving…" : entryId ? "Save changes" : "Add " + kind}</Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
