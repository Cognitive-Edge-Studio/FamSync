import { attachmentLabel, attachmentOf, feedRows, replyText, seenText, typingLabel, type ChannelMessage, type DraftFile, type DraftReply, type FeedRow, type Outgoing } from "@famsync/core/chat";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer, type Draft, type Uploading } from "@/components/composer";
import { ErrorText } from "@/components/form";
import { AttachSheet, ForwardSheet, InfoSheet, MessageSheet, ReactionsSheet, WorkSheet } from "@/components/message-sheets";
import { MessageRow, OutgoingRow, type RowActions } from "@/components/message";
import { confirm, queryState, StaleNotice, WithScope } from "@/components/screen";
import { Button, Icon, Text } from "@/components/ui";
import { getApi } from "@/lib/api";
import { attachmentProblem, uploadAttachment, type Picked } from "@/lib/attachments";
import { cache } from "@/lib/cache";
import { useConversation } from "@/lib/conversation";
import { scopeParams, type Scope } from "@/lib/scope";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { VoiceRecorder } from '@/components/voice-recorder';
import type { VoiceRecording } from '@/lib/media-rules';

type SavedDraft = Draft & { reply: DraftReply | null; files: DraftFile[] };
type Item = { key: string; row: FeedRow } | { key: string; outgoing: Outgoing };

export default function ChatScreen() {
  const { id, message, family: familyId } = useLocalSearchParams<{ id: string; message?: string; family?: string }>();
  return <WithScope familyId={familyId}>{(family) => <Conversation key={family.id + id} family={family} id={id} wanted={message} />}</WithScope>;
}

function Conversation({ family, id, wanted }: { family: Scope; id: string; wanted?: string }) {
  const { access_token, user } = useSignedIn(), { colors } = useTheme(), insets = useSafeAreaInsets(), chat = useConversation(family.id, id, family.store), { channel, messages, outbox } = chat;
  const { busy, error, setError, save } = useSave(), path = useMemo(() => ({ familyId: family.id, channelId: id }), [family.id, id]);
  const [seed, setSeed] = useState<Draft & { key: number }>({ body: "", mentions: [], key: 0 }), [reply, setReply] = useState<DraftReply | null>(null), [files, setFiles] = useState<DraftFile[]>([]), [uploads, setUploads] = useState<Uploading[]>([]);
  const [editing, setEditing] = useState<ChannelMessage>(), [note, setNote] = useState(""), [highlighted, setHighlighted] = useState<string>(), [atBottom, setAtBottom] = useState(true);
  const [sheet, setSheet] = useState<{ kind: "actions" | "info" | "reactions" | "forward" | "work"; message: ChannelMessage } | { kind: "attach" | 'voice' }>();
  const draft = useRef<Draft>({ body: "", mentions: [] }), beforeEdit = useRef<Draft>(undefined), restored = useRef(false), list = useRef<FlatList<Item>>(null), token = useRef(access_token), mounted = useRef(true);
  token.current = access_token;
  const running = useRef(new Map<string, { file: Picked; stop?: AbortController }>()), uploading = useRef(false), fresh = useRef(new Map<string, number>()), typedAt = useRef(0), placed = useRef(false), offset = useRef(0), settled = useRef(false), visible = useRef(new Set<string>());
  const onVisible = useCallback(({ viewableItems }: { viewableItems: { key: string }[] }) => { visible.current = new Set(viewableItems.map((item) => item.key)); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; for (const { stop } of running.current.values()) stop?.abort(); }; }, []);

  // The draft is saved on this phone as it is typed, and returns after leaving or restarting.
  useEffect(() => {
    void cache.read<SavedDraft>(user.id, family.store, "draft:" + id, true).then((saved) => {
      restored.current = true;
      if (!saved || !mounted.current) return;
      draft.current = { body: saved.data.body, mentions: saved.data.mentions };
      setSeed({ ...draft.current, key: 0 }); setReply(saved.data.reply); setFiles(saved.data.files);
    });
  }, [user.id, family.store, id]);
  const keep = useCallback((value: SavedDraft) => {
    if (!restored.current) return;
    if (value.body || value.reply || value.files.length) void cache.save(user.id, family.store, "draft:" + id, value); else void cache.drop(user.id, family.store, "draft:" + id);
  }, [user.id, family.store, id]);
  useEffect(() => { keep({ ...(beforeEdit.current ?? draft.current), reply, files }); }, [reply, files, keep]);

  useEffect(() => { if (!note) return; const timer = setTimeout(() => setNote(""), 5000); return () => clearTimeout(timer); }, [note]);
  const rows = useMemo(() => feedRows(messages, user.id, chat.unreadAfter), [messages, user.id, chat.unreadAfter]);
  // The list is drawn from the bottom, so the newest message is first.
  const items = useMemo<Item[]>(() => [...chat.outgoing.filter((outgoing) => !messages.some((message) => message.id === outgoing.id)).map((outgoing): Item => ({ key: outgoing.id, outgoing })).reverse(), ...rows.map((row): Item => ({ key: row.message.id, row })).reverse()], [chat.outgoing, messages, rows]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const jump = useCallback(async (target: string) => {
    setError("");
    const result = await chat.reach(target, (wantedId) => itemsRef.current.some((item) => item.key === wantedId));
    if (result !== "ready") return setError(result === "gone" ? "That message is no longer available." : "We couldn’t open that message. Try again.");
    // Rows are measured only as they are drawn, so a far one may take a few steps to reach.
    for (let step = 0; step < 15 && mounted.current; step += 1) {
      const index = itemsRef.current.findIndex((item) => item.key === target);
      if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
      await new Promise((done) => setTimeout(done, 200));
      if (step > 0 && visible.current.has(target)) break;
    }
    if (!mounted.current) return;
    setHighlighted(target);
    setTimeout(() => { if (mounted.current) setHighlighted((old) => old === target ? undefined : old); }, 2500);
  }, [chat.reach, setError]);
  // Opens at the requested message, or at the first unread one.
  useEffect(() => {
    if (placed.current || !messages.length || chat.savedAt) return;
    placed.current = true;
    const first = wanted ?? rows.find((row) => row.unread)?.message.id;
    // Opening at an older message is not reading the newest one.
    if (!first) { settled.current = true; return chat.setBottom(true); }
    void jump(first).then(() => { settled.current = true; if (mounted.current) chat.setBottom(offset.current < 60); });
  }, [messages.length, chat.savedAt, wanted, rows, jump]);

  const signalTyping = (active: boolean) => {
    if (active ? Date.now() - typedAt.current < 3000 : !typedAt.current) return;
    typedAt.current = active ? Date.now() : 0;
    void getApi(token.current).POST("/api/v1/families/{familyId}/channels/{channelId}/typing", { params: { path }, body: { active } }).catch(() => {});
  };
  function endEdit() {
    const back = beforeEdit.current ?? { body: "", mentions: [] };
    beforeEdit.current = undefined;
    draft.current = back;
    setEditing(undefined);
    setSeed((old) => ({ ...back, key: old.key + 1 }));
  }
  async function send(next: Draft) {
    setNote("");
    if (editing) {
      draft.current = next;
      const result = await save(() => getApi(token.current).PUT("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}", { params: { path: { ...path, messageId: editing.id } }, body: { editCount: editing.editCount, body: next.body, mentionedUserIds: next.mentions } }), "We couldn’t save this edit. Try again.");
      if (result.ok) { chat.replace(result.data); endEdit(); setNote("Message edited."); } else if (result.conflict || result.gone) chat.refresh();
      return;
    }
    signalTyping(false);
    setError("");
    chat.clearUnread();
    for (const file of files) fresh.current.delete(file.id);
    draft.current = { body: "", mentions: [] };
    const item = { id: randomUUID(), body: next.body, reply, mentions: next.mentions, files };
    setReply(null); setFiles([]);
    keep({ body: "", mentions: [], reply: null, files: [] });
    void outbox.send(item);
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }
  async function runUploads() {
    if (uploading.current) return;
    uploading.current = true;
    try {
      for (;;) {
        const next = [...running.current].find(([, value]) => !value.stop);
        if (!next || !mounted.current) return;
        const [uploadId, entry] = next, stop = new AbortController();
        entry.stop = stop;
        const patch = (value: Partial<Uploading>) => { if (mounted.current) setUploads((old) => old.map((item) => item.id === uploadId ? { ...item, ...value } : item)); };
        try {
          const stored = await uploadAttachment({ familyId: family.id, channelId: id, id: uploadId, file: entry.file, token: token.current, signal: stop.signal, onProgress: (percent) => patch({ percent }) });
          running.current.delete(uploadId);
          fresh.current.set(stored.id, stored.version);
          if (mounted.current) { setUploads((old) => old.filter((item) => item.id !== uploadId)); setFiles((old) => [...old, { id: stored.id, fileName: stored.fileName }]); }
        } catch (problem) { patch({ error: problem instanceof Error ? problem.message : "We couldn’t upload this file." }); }
      }
    } finally { uploading.current = false; }
  }
  async function sendVoice(voice: VoiceRecording, signal: AbortSignal, onProgress: (percent: number) => void) {
    const stored = await uploadAttachment({ familyId: family.id, channelId: id, id: voice.id, file: voice.file, voiceSeconds: voice.seconds, token: token.current, signal, onProgress });
    if (signal.aborted || !mounted.current) {
      void getApi(token.current).PUT('/api/v1/families/{familyId}/files/{fileId}/archive', { params: { path: { familyId: family.id, fileId: stored.id } }, body: { version: stored.version, archived: true } }).catch(() => {});
      throw new Error('Voice upload cancelled.');
    }
    // The existing outbox owns message delivery from here, including offline retry with this same UUID.
    void outbox.send({ id: voice.id, body: '', reply, mentions: [], files: [{ id: stored.id, fileName: stored.fileName }] });
    setSheet(undefined); setReply(null); chat.clearUnread();
    list.current?.scrollToOffset({ offset: 0, animated: true });
  }
  function addFiles(picked: Picked[]) {
    const problems: string[] = [], space = 5 - files.length - running.current.size;
    const accepted = picked.filter((file, index) => { const problem = attachmentProblem(file) ?? (index >= space ? "a message can have up to five files." : null); if (problem) problems.push(file.name + ": " + problem); return !problem; });
    if (problems.length) setError(problems.join(" "));
    const added = accepted.map((file) => ({ id: randomUUID(), file }));
    for (const { id: uploadId, file } of added) running.current.set(uploadId, { file });
    setUploads((old) => [...old, ...added.map(({ id: uploadId, file }) => ({ id: uploadId, name: file.name, percent: 0 }))]);
    void runUploads();
  }
  function removeFile(file: DraftFile) {
    setFiles((old) => old.filter((item) => item.id !== file.id));
    // A file uploaded for this message and then removed is not left behind in the chat's folder.
    const version = fresh.current.get(file.id);
    if (version !== undefined) void getApi(token.current).PUT("/api/v1/families/{familyId}/files/{fileId}/archive", { params: { path: { familyId: family.id, fileId: file.id } }, body: { version, archived: true } }).catch(() => {});
  }
  const react = async (message: ChannelMessage, emoji: string) => {
    setSheet(undefined);
    const result = await save(() => getApi(token.current).PUT("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/reaction", { params: { path: { ...path, messageId: message.id } }, body: { emoji, active: !message.reactions.find((item) => item.emoji === emoji)?.active } }), "We couldn’t save your reaction. Try again.");
    if (result.ok) chat.replace(result.data);
  };
  const mark = async (message: ChannelMessage, kind: "star" | "pin") => {
    setSheet(undefined);
    const options = { params: { path: { ...path, messageId: message.id } } }, api = getApi(token.current);
    const result = kind === "star" ? await save(() => api.PUT("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/star", { ...options, body: { starred: !message.starred } }), "We couldn’t save this. Try again.")
      : await save(() => api.PUT("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}/pin", { ...options, body: { pinned: !message.pinned } }), "We couldn’t save this. Try again.");
    if (result.ok) { chat.replace(result.data); if (kind === "pin") chat.refresh(); }
  };
  const remove = (message: ChannelMessage) => { setSheet(undefined); confirm("Delete for everyone?", "The message and its reactions are removed for everyone. Files sent with it are archived. People may already have seen it.", "Delete", () => void (async () => {
    const result = await save(() => getApi(token.current).DELETE("/api/v1/families/{familyId}/channels/{channelId}/messages/{messageId}", { params: { path: { ...path, messageId: message.id } } }), "We couldn’t delete this message. Try again.");
    if (!result.ok) return;
    chat.replace(result.data);
    if (editing?.id === message.id) endEdit();
    if (reply?.id === message.id) setReply(null);
    chat.refresh();
  })()); };
  const actions = useMemo<RowActions>(() => ({
    open: (message) => { if (!message.deleted) setSheet({ kind: "actions", message }); }, jump: (target) => void jump(target), reactions: (message) => setSheet({ kind: "reactions", message }),
    work: (work) => { if (work.targetId) router.push(work.kind === "task" ? { pathname: "/task/[id]", params: { id: work.targetId } } : { pathname: "/event/[id]", params: { id: work.targetId } }); },
  }), [jump]);

  const query = { data: channel, savedAt: chat.savedAt, error: chat.error, loading: chat.loading, refresh: chat.refresh };
  const state = queryState(query, { loading: "Loading conversation…", failed: "The conversation couldn’t load", lost: "Conversation not found" });
  if (state || !channel) return <><Stack.Screen options={{ title: "Chat", headerTitle: "Chat" }} />{state}</>;
  const peer = channel.kind === "dm" ? channel.members.find((member) => member.userId !== user.id) : undefined;
  const typists = channel.members.filter((member) => member.userId in chat.typing).map((member) => member.name), typingText = typingLabel(typists, channel.kind === "dm");
  const subtitle = typingText || (channel.kind === "dm" ? (peer?.online ? "Online" : peer?.lastSeen ? seenText(peer.lastSeen) : "Direct conversation") : channel.topic || channel.memberCount + (channel.memberCount === 1 ? " member" : " members"));
  const replyTo = (message: ChannelMessage) => { setSheet(undefined); setReply({ id: message.id, body: replyText({ body: message.body.slice(0, 180), deleted: false, fileCount: message.files.length, attachment: attachmentOf(message.files) }), author: message.author?.userId === user.id ? "You" : message.author?.name ?? "Former member" }); };
  const current = sheet && "message" in sheet ? messages.find((message) => message.id === sheet.message.id) ?? sheet.message : undefined;
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 56} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Stack.Screen options={{ headerTitle: () => <Pressable accessibilityRole="button" accessibilityLabel={channel.name + ", " + subtitle + (channel.muted ? ", muted" : "") + ", details"} onPress={() => router.push({ pathname: "/chat/details", params: { id, ...scopeParams(family) } })} style={{ maxWidth: 260, minHeight: 48, justifyContent: "center" }}><Text size={17} weight="600" numberOfLines={1}>{channel.name}</Text><Text size={13} muted={!typingText} numberOfLines={1} accessibilityLiveRegion={typingText ? "polite" : "none"}>{subtitle + (channel.muted ? " · Muted" : "") + (channel.archived ? " · Archived" : "")}</Text></Pressable> }} />
      {channel.pins.map((pin) => <Pressable key={pin.id} accessibilityRole="button" accessibilityLabel={"Pinned: " + (pin.body || attachmentLabel(pin.attachment, pin.fileCount))} onPress={() => void jump(pin.id)} style={{ minHeight: 44, flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}><Icon name="pin" size={14} color={colors.mutedForeground} /><Text size={13} numberOfLines={1} style={{ flex: 1 }}>{(pin.author?.userId === user.id ? "You" : pin.author?.name ?? "Former member") + ": " + (pin.body || attachmentLabel(pin.attachment, pin.fileCount))}</Text></Pressable>)}
      {chat.error && <View style={{ padding: 12 }}><StaleNotice query={query} /></View>}
      {(error || note) ? <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}><ErrorText>{error}</ErrorText>{note && !error ? <Text muted accessibilityLiveRegion="polite">{note}</Text> : null}</View> : null}
      <FlatList ref={list} inverted data={items} keyExtractor={(item) => item.key} extraData={highlighted} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }} initialNumToRender={20}
        onScroll={({ nativeEvent }) => { offset.current = nativeEvent.contentOffset.y; const bottom = offset.current < 60; setAtBottom(bottom); if (placed.current && settled.current) chat.setBottom(bottom); }} scrollEventThrottle={100}
        onEndReached={() => { if (chat.hasOlder) void chat.older(); }} onEndReachedThreshold={0.4}
        onScrollToIndexFailed={({ index, averageItemLength }) => { list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false }); }} onViewableItemsChanged={onVisible}
        ListEmptyComponent={<View style={{ padding: 32 }}><Text muted style={{ textAlign: "center" }}>No messages yet. Send the first one.</Text></View>}
        ListFooterComponent={chat.loadingOlder ? <Text muted style={{ textAlign: "center", padding: 12 }}>Loading earlier messages…</Text> : undefined}
        renderItem={({ item }) => "row" in item ? <MessageRow row={item.row} channel={channel} familyId={family.id} me={user.id} highlighted={highlighted === item.key} actions={actions} />
          : <OutgoingRow item={item.outgoing} mentions={channel.members.filter((member) => item.outgoing.mentions.includes(member.userId)).map((member) => member.name)} onRetry={() => void outbox.retry(item.key)} onDiscard={() => confirm("Discard this message?", item.outgoing.refused ? "It was not sent." : "If it did reach the chat, it stays there.", "Discard", () => outbox.discard(item.key))}
              onEdit={() => { if (draft.current.body.trim() || editing) return setError("Send or clear the message you are writing first."); const back = outbox.take(item.key); if (!back) return; draft.current = { body: back.body, mentions: back.mentions }; setSeed((old) => ({ ...draft.current, key: old.key + 1 })); setReply(back.reply); setFiles(back.files); keep({ ...draft.current, reply: back.reply, files: back.files }); }} />} />
      {!atBottom && <View style={{ position: "absolute", right: 16, bottom: 90 + insets.bottom }}><Pressable accessibilityRole="button" accessibilityLabel="Jump to latest messages" onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, elevation: 3 }}><Icon name="chevron-down" size={24} color={colors.foreground} /></Pressable></View>}
      <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.panel }}>
        {channel.archived ? <Text muted style={{ padding: 16 }}>Archived channel. History is available; an admin can restore it.</Text>
          : <Composer seed={seed} members={channel.members} me={user.id} reply={reply} editing={editing ? { body: editing.body, files: editing.files.length } : null} files={files} uploads={uploads} busy={!!editing && busy}
              onChange={(next) => { draft.current = next; if (!editing) { signalTyping(!!next.body.trim()); keep({ ...next, reply, files }); } }} onSend={(next) => void send(next)} onVoice={() => { signalTyping(false); setSheet({ kind: 'voice' }); }} onAttach={() => setSheet({ kind: "attach" })} onCancelReply={() => setReply(null)} onCancelEdit={endEdit} onRemoveFile={removeFile}
              onRetryUpload={(uploadId) => { const entry = running.current.get(uploadId); if (!entry) return; entry.stop = undefined; setUploads((old) => old.map((item) => item.id === uploadId ? { ...item, error: undefined, percent: 0 } : item)); void runUploads(); }}
              onCancelUpload={(uploadId) => { running.current.get(uploadId)?.stop?.abort(); running.current.delete(uploadId); setUploads((old) => old.filter((item) => item.id !== uploadId)); }} />}
      </View>
      {sheet?.kind === "attach" && <AttachSheet family={family} channel={channel} limit={5 - files.length - uploads.length} onClose={() => setSheet(undefined)} onPicked={(picked) => { setSheet(undefined); addFiles(picked); }} onSaved={(file) => { setSheet(undefined); setFiles((old) => old.some((item) => item.id === file.id) ? old : [...old, file]); }} onError={setError} />}
      {sheet?.kind === 'voice' && !channel.archived && !chat.error && <VoiceRecorder onClose={() => setSheet(undefined)} onSend={sendVoice} />}
      {sheet?.kind === "actions" && current && <MessageSheet channel={channel} message={current} me={user.id} busy={busy} onClose={() => setSheet(undefined)} onReact={(emoji) => void react(current, emoji)} onReply={() => replyTo(current)} onCopy={() => { setSheet(undefined); void Clipboard.setStringAsync(current.body).then(() => setNote("Message copied."), () => setError("We couldn’t copy this message.")); }}
        onForward={() => setSheet({ kind: "forward", message: current })} onStar={() => void mark(current, "star")} onPin={() => void mark(current, "pin")} onInfo={() => setSheet({ kind: "info", message: current })} onWork={() => setSheet({ kind: "work", message: current })} onDelete={() => remove(current)}
        onEdit={() => { setSheet(undefined); beforeEdit.current ??= draft.current; const next = { body: current.body, mentions: current.mentions.map((person) => person.userId) }; draft.current = next; setEditing(current); setSeed((old) => ({ ...next, key: old.key + 1 })); }} />}
      {sheet?.kind === "info" && current && <InfoSheet channel={channel} message={current} onClose={() => setSheet(undefined)} />}
      {sheet?.kind === "reactions" && current && <ReactionsSheet message={current} me={user.id} locked={channel.archived || busy} onReact={(emoji) => void react(current, emoji)} onClose={() => setSheet(undefined)} />}
      {sheet?.kind === "forward" && current && <ForwardSheet family={family} channelId={id} message={current} onClose={() => setSheet(undefined)} onDone={() => { setSheet(undefined); setNote("Message forwarded."); }} />}
      {sheet?.kind === "work" && current && <WorkSheet family={family} channel={channel} message={current} onClose={() => setSheet(undefined)} onChanged={(text) => { setNote(text); chat.refresh(); }} />}
    </KeyboardAvoidingView>
  );
}
