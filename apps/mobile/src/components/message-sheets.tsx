import type { components } from "@famsync/api-client";
import { dayInZone } from "@famsync/core/calendar-date";
import { quickReactions, receiptPeople, type Channel, type ChannelDetail, type ChannelMessage, type DraftFile } from "@famsync/core/chat";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { getApi, required } from "@/lib/api";
import { chooseDocuments, choosePhotos, chooseVideos, takePhoto, type Picked } from "@/lib/attachments";
import type { Scope } from "@/lib/scope";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { DateField, ErrorText, Field, Row, Select, Sheet } from "./form";
import { Avatar } from "./message";
import { MenuItem } from "./screen";
import { Button, Text } from "./ui";

const emojis = "😀 😂 🤣 😊 😍 🥰 😘 😎 🤔 😅 😢 😭 😡 😴 🤗 🙄 😮 🥳 🤒 🤩 👍 👎 👏 🙏 🙌 👋 💪 🤝 ✌️ 👌 ❤️ 💛 💚 💙 💜 💔 🎉 🎂 🎁 🎈 ⭐ 🔥 ✅ ❌ ❓ ❗ ⏰ 📅 🏠 🚗 🏫 🛒 🍕 🍎 ☕ 🐶 🐱 ⚽ 🌧️ ☀️".split(" ");
const before = (until: string | null) => !!until && Date.now() < Date.parse(until);

function Emoji({ value, active, onPress, disabled }: { value: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={"React " + value} accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: active || pressed ? colors.lavender : "transparent" })}><Text size={24}>{value}</Text></Pressable>;
}

export function MessageSheet({ channel, message, me, busy, onClose, onReact, onReply, onCopy, onForward, onStar, onPin, onInfo, onWork, onEdit, onDelete }: {
  channel: ChannelDetail; message: ChannelMessage; me: string; busy: boolean; onClose: () => void; onReact: (emoji: string) => void; onReply: () => void; onCopy: () => void; onForward: () => void; onStar: () => void; onPin: () => void; onInfo: () => void; onWork: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [all, setAll] = useState(false), open = !channel.archived, active = (emoji: string) => message.reactions.find((item) => item.emoji === emoji)?.active;
  return (
    <Sheet title="Message" onClose={onClose}>
      {open && <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{(all ? emojis : quickReactions).map((emoji) => <Emoji key={emoji} value={emoji} active={active(emoji)} disabled={busy} onPress={() => onReact(emoji)} />)}</View>}
      {open && !all && <MenuItem icon="happy-outline" title="Other reaction" onPress={() => setAll(true)} />}
      {open && <MenuItem icon="arrow-undo-outline" title="Reply" onPress={onReply} />}
      {message.body ? <MenuItem icon="copy-outline" title="Copy text" onPress={onCopy} /> : null}
      <MenuItem icon="arrow-redo-outline" title="Forward" onPress={onForward} />
      <MenuItem icon={message.starred ? "star" : "star-outline"} title={message.starred ? "Remove star" : "Star"} onPress={onStar} />
      {channel.canCreateWork && open && <MenuItem icon="pin-outline" title={message.pinned ? "Unpin" : "Pin for everyone"} onPress={onPin} />}
      {channel.canCreateWork && (open || message.work.length > 0) && <MenuItem icon="link-outline" title="Tasks and events" onPress={onWork} />}
      {message.author?.userId === me && <MenuItem icon="information-circle-outline" title="Message info" onPress={onInfo} />}
      {open && before(message.editableUntil) && <MenuItem icon="pencil-outline" title="Edit" onPress={onEdit} />}
      {before(message.deletableUntil) && <MenuItem icon="trash-outline" title="Delete for everyone" danger onPress={onDelete} />}
    </Sheet>
  );
}

function People({ title, people, me }: { title: string; people: { userId: string; name: string }[]; me: string }) {
  if (!people.length) return null;
  return <View style={{ gap: 6, marginTop: 8 }}><Text muted size={13} weight="600" accessibilityRole="header">{title}</Text>{people.map((person) => <View key={person.userId} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Avatar name={person.name} id={person.userId} size={32} /><Text>{person.userId === me ? "You" : person.name}</Text></View>)}</View>;
}

export function InfoSheet({ channel, message, onClose }: { channel: ChannelDetail; message: ChannelMessage; onClose: () => void }) {
  const people = receiptPeople(channel, message), read = people.filter((member) => (member.readPosition ?? 0) >= message.position), delivered = people.filter((member) => !read.includes(member) && member.deliveredPosition >= message.position);
  return <Sheet title="Message info" onClose={onClose}>{people.length === 0 && <Text muted>Receipts are not available for this message.</Text>}
    <People title="Read by" people={read} me="" /><People title="Delivered to" people={delivered} me="" /><People title="Not delivered yet" people={people.filter((member) => !read.includes(member) && !delivered.includes(member))} me="" />
    <Text muted size={13} style={{ marginTop: 12 }}>{channel.kind === "dm" ? "Reading is shown only when both of you share read receipts." : "People who do not share read receipts stay under Delivered."}</Text></Sheet>;
}

export function ReactionsSheet({ message, me, locked, onReact, onClose }: { message: ChannelMessage; me: string; locked: boolean; onReact: (emoji: string) => void; onClose: () => void }) {
  return <Sheet title="Reactions" onClose={onClose}>{message.reactions.length === 0 && <Text muted>No reactions.</Text>}{message.reactions.map((reaction) => <View key={reaction.emoji} style={{ gap: 4 }}><People title={reaction.emoji} people={reaction.people} me={me} />{!locked && <Button variant="outline" title={reaction.active ? "Remove yours" : "React " + reaction.emoji} onPress={() => onReact(reaction.emoji)} />}</View>)}</Sheet>;
}

export function ForwardSheet({ family, channelId, message, onClose, onDone }: { family: Scope; channelId: string; message: ChannelMessage; onClose: () => void; onDone: () => void }) {
  const { access_token } = useSignedIn(), [chats, setChats] = useState<Channel[]>(), [search, setSearch] = useState(""), [picked, setPicked] = useState<Channel[]>([]), [sent, setSent] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const ids = useRef(new Map<string, string>());
  useEffect(() => {
    const controller = new AbortController(), timer = setTimeout(() => {
      getApi(access_token).GET("/api/v1/families/{familyId}/channels", { params: { path: { familyId: family.id }, query: { kind: "all", q: search.trim() || undefined, limit: 50 } }, signal: controller.signal }).then(required)
        .then((page) => { if (!controller.signal.aborted) { setChats(page.channels); setError(""); } }).catch(() => { if (!controller.signal.aborted) setError("We couldn’t load your chats. Try again."); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [access_token, family.id, search]);
  async function forward() {
    setBusy(true);
    setError("");
    const done = [...sent], failed: string[] = [];
    for (const chat of picked) {
      if (done.includes(chat.id)) continue;
      // Each chat keeps one message ID, so trying again cannot send it twice.
      const id = ids.current.get(chat.id) ?? randomUUID();
      ids.current.set(chat.id, id);
      try {
        const { data, error: problem } = await getApi(access_token).POST("/api/v1/families/{familyId}/channels/{channelId}/forward", { params: { path: { familyId: family.id, channelId: chat.id } }, body: { id, conversationId: channelId, messageId: message.id } });
        if (data) done.push(chat.id); else failed.push(chat.name + ": " + ((problem as { message?: string } | undefined)?.message ?? "not sent."));
      } catch { failed.push(chat.name + ": not confirmed. Trying again is safe."); }
    }
    setSent(done);
    setBusy(false);
    if (failed.length) setError(failed.join(" ")); else onDone();
  }
  return <Sheet title="Forward message" onClose={() => { if (!busy) onClose(); }}><Text muted size={13}>Choose up to five chats. Attached files are copied, and everyone in that chat can see them.</Text><Field label="Find a chat" value={search} maxLength={120} onChangeText={setSearch} />
    {chats?.map((chat) => { const on = picked.some((item) => item.id === chat.id); return <Row key={chat.id} multiple title={chat.name} note={sent.includes(chat.id) ? "Sent" : undefined} selected={on} onPress={() => { if (busy || sent.includes(chat.id) || (!on && picked.length >= 5)) return; setPicked(on ? picked.filter((item) => item.id !== chat.id) : [...picked, chat]); }} />; })}
    <ErrorText>{error}</ErrorText><Button title={"Forward" + (picked.length > 1 ? " to " + picked.length : "")} busy={busy} disabled={!picked.length} onPress={() => void forward()} /></Sheet>;
}

export function AttachSheet({ family, channel, limit, onClose, onPicked, onSaved, onError }: { family: Scope; channel: ChannelDetail; limit: number; onClose: () => void; onPicked: (files: Picked[]) => void; onSaved: (file: DraftFile) => void; onError: (text: string) => void }) {
  const { access_token } = useSignedIn(), [saved, setSaved] = useState<components["schemas"]["StoredFileDto"][]>(), [library, setLibrary] = useState(false), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!library) return;
    const controller = new AbortController();
    getApi(access_token).GET("/api/v1/families/{familyId}/files", { params: { path: { familyId: family.id }, query: { channelId: channel.id, sort: "recent", limit: 50 } }, signal: controller.signal }).then(required).then((page) => { if (!controller.signal.aborted) setSaved(page.files); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [library, access_token, family.id, channel.id]);
  async function run(pick: () => Promise<Picked[]>) {
    setBusy(true);
    try { onPicked(await pick()); } catch (problem) { onClose(); onError(problem instanceof Error ? problem.message : "We couldn’t open that."); }
  }
  if (library) return <Sheet title="Choose a saved file" onClose={onClose}>{failed && <ErrorText>We couldn’t load saved files. Try again.</ErrorText>}{saved?.length === 0 && <Text muted>No saved files in this conversation.</Text>}{saved?.map((file) => <Row key={file.id} title={file.fileName} selected={false} onPress={() => onSaved({ id: file.id, fileName: file.fileName })} />)}</Sheet>;
  return <Sheet title="Attach" onClose={onClose}>
    {Platform.OS !== "web" && <MenuItem icon="camera-outline" title="Take a photo" disabled={busy} onPress={() => void run(takePhoto)} />}
    <MenuItem icon="image-outline" title="Choose photos" disabled={busy} onPress={() => void run(() => choosePhotos(limit))} />
    <MenuItem icon="videocam-outline" title="Choose videos" disabled={busy} onPress={() => void run(() => chooseVideos(limit))} />
    <MenuItem icon="document-outline" title="Choose files" disabled={busy} onPress={() => void run(chooseDocuments)} />
    <MenuItem icon="folder-open-outline" title="Choose a saved file" disabled={busy} onPress={() => setLibrary(true)} />
    <Text muted size={13}>Up to 5 MB each. Photos are resized, and their location details are removed.</Text>
  </Sheet>;
}

export function WorkSheet({ family, channel, message, onClose, onChanged }: { family: Scope; channel: ChannelDetail; message: ChannelMessage; onClose: () => void; onChanged: (note: string) => void }) {
  const { access_token, user } = useSignedIn(), { busy, error, setError, save } = useSave(), path = { familyId: family.id, channelId: channel.id, messageId: message.id };
  const [mode, setMode] = useState<"list" | "task" | "event">("list"), id = useRef("");
  const others = channel.members.filter((member) => !member.guest && member.userId !== user.id);
  const [title, setTitle] = useState(message.body.slice(0, 120)), [description, setDescription] = useState(""), [due, setDue] = useState(""), [audience, setAudience] = useState<"private" | "selected">(others.length ? "selected" : "private"), [selected, setSelected] = useState(others.map((member) => member.userId)), [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState(""), [events, setEvents] = useState<components["schemas"]["LinkableEventDto"][]>(), [next, setNext] = useState<string | null>(null), [cursor, setCursor] = useState<string>(), [picked, setPicked] = useState("");
  const eligible = channel.members.filter((member) => !member.guest && (member.userId === user.id || (audience === "selected" && selected.includes(member.userId))));
  useEffect(() => {
    if (mode !== "event") return;
    const controller = new AbortController(), timer = setTimeout(() => {
      getApi(access_token).GET("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/events", { params: { path: { familyId: family.id, channelId: channel.id, messageId: message.id }, query: { q: search.trim() || undefined, cursor } }, signal: controller.signal }).then(required)
        .then((page) => { if (controller.signal.aborted) return; setEvents((old) => cursor ? [...(old ?? []), ...page.events.filter((event) => !old?.some((item) => item.id === event.id))] : page.events); setNext(page.nextCursor); }).catch(() => { if (!controller.signal.aborted) setError("We couldn’t load events. Try again."); });
    }, cursor ? 0 : 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, search, cursor, access_token, family.id, channel.id, message.id, setError]);
  async function createTask() {
    if (!title.trim()) return setError("Enter a task title.");
    if (audience === "selected" && !selected.length) return setError("Choose at least one conversation member.");
    if (assignee && !eligible.some((member) => member.userId === assignee)) return setError("Choose an assignee who can see this task.");
    id.current ||= randomUUID();
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/tasks", { params: { path }, body: { id: id.current, title: title.trim(), description: description.trim(), audience, selectedMemberIds: audience === "selected" ? selected : [], assigneeId: assignee || null, dueDate: due || null, remindMinutes: null, conversationVersion: channel.version } }), "We couldn’t create this task. Try again.");
    if (result.ok) { onChanged("Task created."); onClose(); } else if (result.conflict) onChanged("");
  }
  async function linkEvent() {
    id.current ||= randomUUID();
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/events", { params: { path }, body: { id: id.current, eventId: picked, version: channel.version } }), "We couldn’t link this event. Try again.");
    if (result.ok) { onChanged("Event linked."); onClose(); } else if (result.conflict) onChanged("");
  }
  async function unlink(work: ChannelMessage["work"][number]) {
    const result = await save(() => getApi(access_token).DELETE("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/work/{kind}/{workId}", { params: { path: { ...path, kind: work.kind, workId: work.id } }, body: { version: work.version } }), "We couldn’t remove this link. Try again.");
    if (result.ok) { onChanged("Work link removed."); onClose(); }
  }
  return (
    <Sheet title={mode === "task" ? "Create task from message" : mode === "event" ? "Link an event" : "Tasks and events"} onClose={() => { if (!busy) onClose(); }}>
      {mode === "list" && <>
        {message.work.map((work) => <View key={work.kind + work.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ flex: 1 }}>{(work.kind === "task" ? "Task: " : "Event: ") + (work.title ?? "unavailable")}</Text>{work.canUnlink && !channel.archived && <Button variant="outline" title="Unlink" busy={busy} onPress={() => void unlink(work)} />}</View>)}
        {!channel.archived && <><MenuItem icon="checkbox-outline" title="Create task" onPress={() => setMode("task")} /><MenuItem icon="calendar-outline" title="Link event" onPress={() => setMode("event")} /></>}
      </>}
      {mode === "task" && <View style={{ gap: 14 }}>
        <Field label="Task title" value={title} maxLength={120} onChangeText={setTitle} /><Field label="Task description" value={description} maxLength={2000} multiline onChangeText={setDescription} />
        <Select label="Who can see this task" value={audience} onChange={setAudience} choices={[{ value: "private", label: "Only me" }, { value: "selected", label: "Selected conversation members" }]} />
        {audience === "selected" && others.map((member) => <Row key={member.userId} multiple title={member.name} selected={selected.includes(member.userId)} onPress={() => setSelected(selected.includes(member.userId) ? selected.filter((item) => item !== member.userId) : [...selected, member.userId])} />)}
        <Select label="Assigned to" value={assignee} onChange={(value: string) => setAssignee(value)} choices={[{ value: "", label: "Nobody" }, ...eligible.map((member) => ({ value: member.userId, label: member.name }))]} />
        <DateField label="Due date" value={due} today={dayInZone(new Date(), family.timeZone)} optional onChange={setDue} /><ErrorText>{error}</ErrorText><Button title="Create task" busy={busy} onPress={() => void createTask()} />
      </View>}
      {mode === "event" && <View style={{ gap: 8 }}><Text muted size={13}>Event details are visible only to people who can already open the event.</Text><Field label="Find an event" value={search} maxLength={120} onChangeText={(value) => { setSearch(value); setCursor(undefined); setPicked(""); }} />
        {events?.length === 0 && <Text muted>No events match.</Text>}{events?.map((event) => <Row key={event.id} title={event.title} selected={picked === event.id} onPress={() => { setPicked(event.id); id.current = ""; }} />)}{next && <Button variant="outline" title="Load more" onPress={() => setCursor(next)} />}
        <ErrorText>{error}</ErrorText><Button title="Link event" busy={busy} disabled={!picked} onPress={() => void linkEvent()} /></View>}
      {mode === "list" && <ErrorText>{error}</ErrorText>}
    </Sheet>
  );
}
