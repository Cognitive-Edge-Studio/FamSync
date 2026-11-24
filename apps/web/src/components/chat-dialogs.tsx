"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { Session } from "@supabase/auth-js";
import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getBrowserApi } from "@/lib/browser-auth";
import { chatMessagePath, type Channel, type ChannelDetail, type ChannelMessage } from "@/lib/channels";
import type { components } from "@famsync/api-client";
import { FormFeedback, inputClass } from "./account-fields";
import { familyError } from "./family-session";
import { Avatar } from "./ui/avatar";
import { Button } from "./ui/button";

function ChatDialog({ title, description, busy, onClose, children }: { title: string; description: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-xl transition-[opacity,scale] duration-200 ease-out data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Resolves to an error message, or nothing when it worked. */
export function ConfirmDialog({ title, description, action, onConfirm, onClose }: { title: string; description: string; action: string; onConfirm: () => Promise<string | void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return (
    <ChatDialog title={title} description={description} busy={busy} onClose={onClose}>
      <FormFeedback error={error} />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="destructive" disabled={busy} onClick={async () => {
          setBusy(true);
          setError("");
          const failed = await onConfirm().catch(() => "We couldn’t finish this. Try again.");
          setBusy(false);
          if (failed) setError(failed); else onClose();
        }}>{busy ? "Working…" : action}</Button>
      </div>
    </ChatDialog>
  );
}

export function MessageInfoDialog({ channel, message, people, onClose }: { channel: ChannelDetail; message: ChannelMessage; people: ChannelDetail["members"]; onClose: () => void }) {
  const read = people.filter((member) => (member.readPosition ?? 0) >= message.position);
  const delivered = people.filter((member) => !read.includes(member) && member.deliveredPosition >= message.position);
  const groups = [["Read by", read], ["Delivered to", delivered], ["Not delivered yet", people.filter((member) => !read.includes(member) && !delivered.includes(member))]] as const;
  return (
    <ChatDialog title="Message info" description={(message.body || "Attachment").slice(0, 120)} busy={false} onClose={onClose}>
      {people.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Receipts are not available for this message.</p>}
      {groups.map(([label, members]) => members.length > 0 && (
        <section key={label} className="mt-4">
          <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
          <ul className="mt-1 grid gap-1.5">{members.map((member) => <li key={member.userId} className="flex items-center gap-2 text-sm"><Avatar name={member.name} colorKey={member.userId} size="sm" /><span className="truncate">{member.name}</span></li>)}</ul>
        </section>
      ))}
      <p className="mt-4 text-xs text-muted-foreground">{channel.kind === "dm" ? "Reading is shown only when both of you share read receipts." : "People who do not share read receipts stay under Delivered."}</p>
      <div className="mt-4 flex justify-end"><Button variant="outline" onClick={onClose}>Close</Button></div>
    </ChatDialog>
  );
}

export function ForwardDialog({ session, familyId, channelId, message, onClose, onDone }: { session: Session; familyId: string; channelId: string; message: ChannelMessage; onClose: () => void; onDone: (note: string) => void }) {
  const [chats, setChats] = useState<Channel[]>(), [query, setQuery] = useState(""), [search, setSearch] = useState(""), [picked, setPicked] = useState<Channel[]>([]), [sent, setSent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ids = useRef(new Map<string, string>());
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    getBrowserApi(session.access_token).GET("/api/v1/families/{familyId}/channels", { params: { path: { familyId }, query: { kind: "all", q: search || undefined, limit: 50 } }, signal: controller.signal })
      .then(({ data }) => { if (controller.signal.aborted) return; if (data) setChats(data.channels); else setError("We couldn’t load your chats. Try again."); })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your chats. Try again."); });
    return () => controller.abort();
  }, [session.access_token, familyId, search]);
  async function forward() {
    setBusy(true);
    setError("");
    const done = [...sent], failed: string[] = [];
    for (const chat of picked) {
      if (done.includes(chat.id)) continue;
      // Each chat keeps one message ID, so trying again cannot send it twice.
      const id = ids.current.get(chat.id) ?? crypto.randomUUID();
      ids.current.set(chat.id, id);
      try {
        const { data, error: problem } = await getBrowserApi(session.access_token).POST("/api/v1/families/{familyId}/channels/{channelId}/forward", { params: { path: { familyId, channelId: chat.id } }, body: { id, conversationId: channelId, messageId: message.id } });
        if (data) done.push(chat.id); else failed.push(chat.name + ": " + familyError(problem, "not sent."));
      } catch { failed.push(chat.name + ": not confirmed. Trying again is safe."); }
    }
    setSent(done);
    setBusy(false);
    if (failed.length) setError(failed.join(" ")); else { onDone("Message forwarded."); onClose(); }
  }
  return (
    <ChatDialog title="Forward message" description="Choose up to five chats. Attached files are copied, and everyone in that chat can see them." busy={busy} onClose={onClose}>
      <label htmlFor="forward-search" className="sr-only">Find a chat</label>
      <input id="forward-search" className={inputClass + " mt-4"} placeholder="Find a chat" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} />
      <ul className="mt-3 grid max-h-72 grid-cols-1 gap-0.5 overflow-y-auto" aria-label="Chats">
        {chats?.map((chat) => {
          const chosen = picked.some((item) => item.id === chat.id), done = sent.includes(chat.id);
          return (
            <li key={chat.id}>
              <button type="button" aria-pressed={chosen} disabled={busy || done || (!chosen && picked.length >= 5)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm hover:bg-accent disabled:opacity-60 aria-pressed:bg-muted"
                onClick={() => setPicked((items) => chosen ? items.filter((item) => item.id !== chat.id) : [...items, chat])}>
                {chat.kind === "dm" ? <Avatar name={chat.name} colorKey={chat.peer?.userId} /> : <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-muted">{chat.emoji}</span>}
                <span className="min-w-0 grow truncate">{chat.name}</span>
                {done ? <span className="text-xs text-muted-foreground">Sent</span> : chosen && <Check aria-hidden="true" className="size-4" />}
              </button>
            </li>
          );
        })}
      </ul>
      {chats?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No chats match.</p>}
      <FormFeedback error={error} note={!chats && !error ? "Loading chats…" : undefined} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={busy || picked.length === 0} onClick={() => void forward()}>{busy ? "Forwarding…" : "Forward" + (picked.length > 1 ? " to " + picked.length : "")}</Button>
      </div>
    </ChatDialog>
  );
}

type Starred = components["schemas"]["MessageSearchItemDto"];
export function StarredMessages({ familyId, accessToken }: { familyId: string; accessToken: string }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<Starred[]>([]), [next, setNext] = useState<string | null>(null), [cursor, setCursor] = useState<string>(), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getBrowserApi(accessToken).GET("/api/v1/families/{familyId}/channels/starred-messages", { params: { path: { familyId }, query: { cursor, limit: 20 } }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (!data) throw new Error();
        setRows((old) => cursor ? [...new Map([...old, ...data.messages].map((row) => [row.id, row])).values()] : data.messages);
        setNext(data.nextCursor);
      })
      .catch(() => { if (!controller.signal.aborted) setError("We couldn’t load starred messages. Try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, accessToken, familyId, cursor]);
  return (
    <details className="mt-3 rounded-xl border border-border bg-panel p-4" onToggle={(event) => { setOpen(event.currentTarget.open); setCursor(undefined); }}>
      <summary className="cursor-pointer font-semibold">Starred messages</summary>
      <FormFeedback error={error} note={loading && !rows.length ? "Loading starred messages…" : undefined} />
      {!loading && !error && rows.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Star a message to find it here. Only you see your stars.</p>}
      <ul aria-label="Starred messages" className="mt-3 grid grid-cols-1 gap-2">
        {rows.map((row) => (
          <li key={row.id}><a href={chatMessagePath(familyId, row.conversationId, row.id, row.conversationKind)} className="block rounded-xl bg-background p-3">
            <p className="text-xs text-muted-foreground">{row.conversationName} · {row.author?.name ?? "Former member"}</p>
            <p className="mt-1 text-sm wrap-anywhere whitespace-pre-wrap">{row.body.slice(0, 240) || "Attachment"}</p></a></li>
        ))}
      </ul>
      {next && <Button className="mt-3" variant="outline" disabled={loading} onClick={() => setCursor(next)}>More starred messages</Button>}
    </details>
  );
}
