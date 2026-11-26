"use client";

import type { components } from "@famsync/api-client";
import type { Session } from "@supabase/auth-js";
import { ArrowUp, Check, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { cn } from "@/lib/utils";
import { Field, FormFeedback, inputClass } from "./account-fields";
import { AppShell } from "./app-shell";
import { FamilySession, familyError } from "./family-session";
import { ScheduleFamily } from "./schedule-family";
import { Button } from "./ui/button";
import { PageHeader } from "./ui/page-header";
import { HelperAvatar } from './ui/helper-avatar';

type Status = components["schemas"]["FamilyHelperStatusDto"];
type Item = components["schemas"]["FamilyHelperListItemDto"];
type Fact = components["schemas"]["FamilyHelperFactDto"];
type Turn = { role: "user" | "model"; text: string; actions?: string[]; suggestions?: string[] };

const emojis = ["🌿", "🦉", "🐝", "🌻", "🐢", "🤖"];
const prompts = ["Catch me up", "What’s on the shopping list?", "What’s coming up this week?", "Plan three easy dinners and add what we need"];
const actionLabels: Record<string, string> = {
  add_to_shopping_list: "Updated the shopping list", check_off_shopping_list: "Checked items off", remember: "Saved to memory",
  create_task: "Created a task", read_unread_messages: "Read your unread messages", read_family_plans: "Looked at family plans", read_shopping_list: "Read the shopping list",
};
const changesList = new Set(["add_to_shopping_list", "check_off_shopping_list"]);

function HelperTile({ emoji, className }: { emoji: string; className?: string }) {
  return <HelperAvatar emoji={emoji} className={className} />;
}

/** Shown until someone adds the family's helper, and reused to rename it. */
function HelperForm({ session, familyId, current, onSaved, onCancel }: {
  session: Session; familyId: string; current?: { name: string; emoji: string }; onSaved: (status: Status) => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(current?.name ?? "");
  const [emoji, setEmoji] = useState(current?.emoji ?? emojis[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await getBrowserApi(session.access_token).PUT("/api/v1/families/{familyId}/helper", { params: { path: { familyId } }, body: { name: name.trim(), emoji } });
      if (data) onSaved(data); else setError(familyError(failure, "We couldn’t save the helper. Try again."));
    } catch { setError("We couldn’t save the helper. Try again."); }
    setBusy(false);
  }
  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-4">
      <Field id="helper-name" label="Name">
        <input id="helper-name" className={inputClass} maxLength={40} required placeholder="For example, Juniper" value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Look</legend>
        <div className="flex flex-wrap gap-2">
          {emojis.map((option) => (
            <label key={option} className={cn("grid size-11 cursor-pointer place-items-center rounded-xl border text-xl transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ring",
              option === emoji ? "border-primary bg-sage" : "border-border bg-panel hover:bg-accent")}>
              <input type="radio" name="helper-emoji" className="sr-only" value={option} checked={option === emoji} onChange={() => setEmoji(option)} />
              {option==='🌿'?<HelperAvatar className="size-9 rounded-lg bg-transparent ring-0"/>:<span aria-hidden="true">{option}</span>}<span className="sr-only">{option==='🌿'?'Mascot':option}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <FormFeedback error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : current ? "Save" : "Add to the family"}</Button>
        {onCancel && <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

function Adopt({ session, familyId, onSaved }: { session: Session; familyId: string; onSaved: (status: Status) => void }) {
  return (
    <section aria-labelledby="adopt-title" className="mx-auto grid max-w-2xl gap-6 rounded-2xl border border-border bg-panel p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <HelperAvatar full className="size-20" />
        <div>
          <h2 id="adopt-title" className="text-lg font-semibold">Add a Family Helper</h2>
          <p className="mt-1 text-sm text-muted-foreground">An AI member of your family that lives in FamSync. Give it a name and it’s ready.</p>
        </div>
      </div>
      <ul className="grid gap-2 text-sm">
        {["Catches you up on what you missed in your chats", "Keeps one shared shopping list and gathers what everyone wants",
          "Remembers what matters, like preferences and routines", "Joins any chat: just say its name to ask for help"].map((line) => (
          <li key={line} className="flex items-start gap-2"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{line}</li>
        ))}
      </ul>
      <HelperForm session={session} familyId={familyId} onSaved={onSaved} />
    </section>
  );
}

function ShoppingList({ session, familyId, items, onChange }: { session: Session; familyId: string; items: Item[] | undefined; onChange: (items: Item[]) => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const api = () => getBrowserApi(session.access_token);
  const path = { familyId };
  async function change(work: () => Promise<{ data?: Item[]; error?: unknown }>) {
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await work();
      if (data) onChange(data); else setError(familyError(failure, "We couldn’t update the list."));
    } catch { setError("We couldn’t update the list."); }
    setBusy(false);
  }
  const open = items?.filter((item) => !item.done) ?? [];
  const bought = items?.filter((item) => item.done) ?? [];
  return (
    <section aria-labelledby="list-title" className="grid content-start gap-3 rounded-2xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="list-title" className="font-semibold">Shopping list</h2>
        <span className="text-xs text-muted-foreground">{open.length} to buy</span>
      </div>
      <form className="flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        const value = title.trim();
        if (!value || busy) return;
        setTitle("");
        void change(() => api().POST("/api/v1/families/{familyId}/helper/list", { params: { path }, body: { title: value } }));
      }}>
        <label htmlFor="list-add" className="sr-only">Add an item</label>
        <input id="list-add" className={inputClass} maxLength={120} placeholder="Add an item" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Button type="submit" variant="outline" disabled={busy || !title.trim()}>Add</Button>
      </form>
      <FormFeedback error={error} note={items ? undefined : "Loading the list…"} />
      {items && !items.length && <p className="text-sm text-muted-foreground">Nothing on the list. Add something, or ask your helper.</p>}
      <ul className="grid gap-0.5">
        {[...open, ...bought].map((item) => (
          <li key={item.id} className="group flex min-h-10 items-center gap-2.5 rounded-lg px-1.5 hover:bg-muted/60">
            <input type="checkbox" id={"item-" + item.id} className="size-4 shrink-0 accent-primary" checked={item.done} disabled={busy}
              onChange={() => void change(() => api().PUT("/api/v1/families/{familyId}/helper/list/{itemId}", { params: { path: { familyId, itemId: item.id } }, body: { done: !item.done } }))} />
            <label htmlFor={"item-" + item.id} className="min-w-0 flex-1 cursor-pointer py-1.5">
              <span className={cn("block text-sm wrap-anywhere", item.done && "text-muted-foreground line-through")}>{item.title}</span>
              {(item.requestedBy || item.addedByHelper) && <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {item.addedByHelper && <Sparkles aria-label="Added by the helper" className="size-3" />}
                {item.requestedBy ? "For " + item.requestedBy.name : "Added by the helper"}
              </span>}
            </label>
            <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={"Remove " + item.title} className="opacity-60 group-hover:opacity-100"
              onClick={() => void change(() => api().DELETE("/api/v1/families/{familyId}/helper/list/{itemId}", { params: { path: { familyId, itemId: item.id } } }))}><X aria-hidden="true" /></Button>
          </li>
        ))}
      </ul>
      {bought.length > 0 && <Button variant="ghost" className="w-fit" disabled={busy}
        onClick={() => void change(() => api().DELETE("/api/v1/families/{familyId}/helper/list/done", { params: { path } }))}>Clear {bought.length} bought</Button>}
    </section>
  );
}

function Memory({ session, familyId, facts, onChange, name }: { session: Session; familyId: string; facts: Fact[] | undefined; onChange: (facts: Fact[]) => void; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function forget(fact: Fact) {
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await getBrowserApi(session.access_token).DELETE("/api/v1/families/{familyId}/helper/memory/{factId}", { params: { path: { familyId, factId: fact.id } } });
      if (data) onChange(data); else setError(familyError(failure, "We couldn’t remove this."));
    } catch { setError("We couldn’t remove this."); }
    setBusy(false);
  }
  return (
    <section aria-labelledby="memory-title" className="grid content-start gap-3 rounded-2xl border border-border bg-panel p-4">
      <div>
        <h2 id="memory-title" className="font-semibold">What {name} remembers</h2>
        <p className="text-xs text-muted-foreground">Tell {name} things like “Sam is vegetarian”. Remove anything you like.</p>
      </div>
      <FormFeedback error={error} note={facts ? undefined : "Loading…"} />
      {facts && !facts.length && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      <ul className="grid gap-1">
        {facts?.map((fact) => (
          <li key={fact.id} className="group flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted/60">
            <p className="min-w-0 flex-1 text-sm wrap-anywhere">{fact.about && <span className="font-medium">{fact.about.name}: </span>}{fact.fact}</p>
            <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={"Forget: " + fact.fact} className="opacity-60 group-hover:opacity-100" onClick={() => void forget(fact)}><Trash2 aria-hidden="true" /></Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Conversation({ session, familyId, status, onActions }: { session: Session; familyId: string; status: Status; onActions: (actions: string[]) => void }) {
  const helper = status.helper!;
  const storageKey = "famsync-helper-chat-" + familyId;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  // The conversation is kept for this browser tab only, as a convenience.
  useEffect(() => {
    try { const saved = sessionStorage.getItem(storageKey); if (saved) setTurns(JSON.parse(saved) as Turn[]); } catch { /* Starts empty. */ }
  }, [storageKey]);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(turns.slice(-30))); } catch { /* Not saved. */ }
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, storageKey]);

  async function send(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    setBusy(true); setError(""); setMessage("");
    const history = turns.slice(-10).map(({ role, text: said }) => ({ role, text: said }));
    setTurns((current) => [...current, { role: "user", text: asked }]);
    try {
      const { data, error: failure } = await getBrowserApi(session.access_token).POST("/api/v1/families/{familyId}/helper/ask", { params: { path: { familyId } }, body: { message: asked, history } });
      if (data) {
        setTurns((current) => [...current, { role: "model", text: data.answer, actions: data.actions, suggestions: data.suggestions }]);
        onActions(data.actions);
      } else {
        setError(familyError(failure, helper.name + " couldn’t answer. Try again."));
        setTurns((current) => current.slice(0, -1)); setMessage(asked);
      }
    } catch {
      setError(helper.name + " couldn’t answer. Try again.");
      setTurns((current) => current.slice(0, -1)); setMessage(asked);
    }
    setBusy(false);
  }

  return (
    <section aria-label={"Talk to " + helper.name} className="flex min-h-[28rem] flex-col rounded-2xl border border-border bg-panel">
      <div className="flex-1 overflow-y-auto p-4 sm:p-5" aria-live="polite">
        {!turns.length && (
          <div className="grid justify-items-center gap-3 py-8 text-center">
            <HelperAvatar emoji={helper.emoji} full className="size-32 text-4xl" />
            <p className="font-semibold">Hi, I’m {helper.name}.</p>
            <p className="max-w-sm text-sm text-muted-foreground">Ask me to catch you up, sort the shopping list, or remember something for the family.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {prompts.map((prompt) => <button key={prompt} type="button" disabled={busy || !status.available} onClick={() => void send(prompt)}
                className="min-h-8 rounded-full border border-border px-3 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{prompt}</button>)}
            </div>
          </div>
        )}
        <ul className="grid gap-4">
          {turns.map((turn, index) => (
            <li key={index} className={cn("flex gap-2.5", turn.role === "user" && "flex-row-reverse")}>
              {turn.role === "model" && <HelperTile emoji={helper.emoji} className="size-8 rounded-full text-base" />}
              <div className={cn("grid max-w-[min(36rem,85%)] gap-1.5", turn.role === "user" ? "justify-items-end" : "justify-items-start")}>
                <p className={cn("rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere",
                  turn.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>{turn.text}</p>
                {!!turn.actions?.length && <ul className="flex flex-wrap gap-1" aria-label="What the helper did">
                  {[...new Set(turn.actions)].map((action) => <li key={action} className="inline-flex items-center gap-1 rounded-full bg-sage px-2 py-0.5 text-[0.6875rem] text-sage-foreground">
                    <Check aria-hidden="true" className="size-3" />{actionLabels[action] ?? action}</li>)}
                </ul>}
                {turn.role === "model" && index === turns.length - 1 && !busy && !!turn.suggestions?.length && <div className="flex flex-wrap gap-1.5" aria-label="Suggested replies">
                  {turn.suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={!status.available} onClick={() => void send(suggestion)}
                    className="min-h-8 rounded-full border border-primary/40 bg-panel px-3 text-xs font-medium text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{suggestion}</button>)}
                </div>}
              </div>
            </li>
          ))}
          {busy && <li className="flex gap-2.5"><HelperTile emoji={helper.emoji} className="size-8 rounded-full text-base" />
            <p role="status" className="rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">{helper.name} is thinking…</p></li>}
        </ul>
        <div ref={end} />
      </div>
      <form className="grid gap-2 border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); void send(message); }}>
        <FormFeedback error={error} />
        <div className="flex items-end gap-2">
          <label htmlFor="helper-message" className="sr-only">Message {helper.name}</label>
          <textarea id="helper-message" rows={1} maxLength={2000} className={cn(inputClass, "max-h-40 min-h-10 resize-none py-2")} disabled={!status.available}
            placeholder={status.available ? "Message " + helper.name : "AI isn’t set up on this server yet"} value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(message); } }} />
          <Button type="submit" size="icon" aria-label="Send" disabled={busy || !message.trim() || !status.available}><ArrowUp aria-hidden="true" /></Button>
        </div>
        {turns.length > 0 && <button type="button" className="w-fit text-xs text-muted-foreground underline-offset-4 hover:underline" disabled={busy} onClick={() => setTurns([])}>Start a new conversation</button>}
      </form>
    </section>
  );
}

function HelperHome({ session, familyId }: { session: Session; familyId: string }) {
  const [status, setStatus] = useState<Status>();
  const [items, setItems] = useState<Item[]>();
  const [facts, setFacts] = useState<Fact[]>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const api = getBrowserApi(session.access_token);
    const path = { familyId };
    (async () => {
      try {
        const [helper, list, memory] = await Promise.all([
          api.GET("/api/v1/families/{familyId}/helper", { params: { path }, signal: controller.signal }),
          api.GET("/api/v1/families/{familyId}/helper/list", { params: { path }, signal: controller.signal }),
          api.GET("/api/v1/families/{familyId}/helper/memory", { params: { path }, signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (!helper.data) throw new Error(familyError(helper.error, "We couldn’t load the Family Helper."));
        setStatus(helper.data); setItems(list.data ?? []); setFacts(memory.data ?? []);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "We couldn’t load the Family Helper.");
      }
    })();
    return () => controller.abort();
  }, [session.access_token, familyId, revision]);

  async function refreshSide(actions: string[]) {
    const api = getBrowserApi(session.access_token);
    const path = { familyId };
    try {
      if (actions.some((action) => changesList.has(action))) { const { data } = await api.GET("/api/v1/families/{familyId}/helper/list", { params: { path } }); if (data) setItems(data); }
      if (actions.includes("remember")) { const { data } = await api.GET("/api/v1/families/{familyId}/helper/memory", { params: { path } }); if (data) setFacts(data); }
    } catch { /* The next visit shows the change. */ }
  }

  if (error) return <div className="mt-6 grid justify-items-start gap-3"><FormFeedback error={error} /><Button variant="outline" onClick={() => { setError(""); setRevision((value) => value + 1); }}>Try again</Button></div>;
  if (!status) return <div className="mt-6"><FormFeedback note="Loading the Family Helper…" /></div>;
  if (!status.helper) return <><PageHeader title="Family Helper" description="Your family’s AI helper, living right here in FamSync." /><Adopt session={session} familyId={familyId} onSaved={setStatus} /></>;

  const helper = status.helper;
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><HelperTile emoji={helper.emoji} className="size-10 text-xl" />{helper.name}</span>}
        description={"Your Family Helper. Add " + helper.name + " to any chat with the helper button in its header, then say @" + helper.name + "."}
        actions={!editing && <Button variant="ghost" className="gap-2" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />Rename</Button>} />
      {editing && <section aria-label="Rename the helper" className="mb-5 max-w-xl rounded-2xl border border-border bg-panel p-5">
        <HelperForm session={session} familyId={familyId} current={helper} onSaved={(next) => { setStatus(next); setEditing(false); }} onCancel={() => setEditing(false)} />
      </section>}
      {!status.available && <p className="mb-4 rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground">
        {helper.name} can’t talk yet because AI isn’t set up on this server. The shopping list and memory still work.</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Conversation key={familyId} session={session} familyId={familyId} status={status} onActions={(actions) => void refreshSide(actions)} />
        <div className="grid content-start gap-5">
          <ShoppingList session={session} familyId={familyId} items={items} onChange={setItems} />
          <Memory session={session} familyId={familyId} facts={facts} onChange={setFacts} name={helper.name} />
        </div>
      </div>
    </>
  );
}

export function HelperScreen() {
  return (
    <AppShell activePage="helper">
      <div className="pb-4">
        <FamilySession>{(session) => <ScheduleFamily session={session} section="helper">{(family) => <HelperHome key={family.id + session.user.id} session={session} familyId={family.id} />}</ScheduleFamily>}</FamilySession>
      </div>
    </AppShell>
  );
}
