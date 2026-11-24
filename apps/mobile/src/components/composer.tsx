import { mentionQuery, showsMention, type ChannelDetail, type DraftFile, type DraftReply } from "@famsync/core/chat";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Avatar } from "./message";
import { Icon, Text } from "./ui";

export type Draft = { body: string; mentions: string[] };
export type Uploading = { id: string; name: string; percent: number; error?: string };

function Banner({ title, text, onClose, label }: { title: string; text: string; onClose: () => void; label: string }) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: colors.muted, borderRadius: 10, paddingLeft: 10 }}><View style={{ flex: 1, paddingVertical: 6 }}><Text size={13} weight="600">{title}</Text><Text size={13} muted numberOfLines={1}>{text}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onClose} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={22} color={colors.foreground} /></Pressable></View>;
}

/** `seed` replaces the text from outside: the saved draft, or a message being edited. */
export function Composer({ seed, members, me, reply, editing, files, uploads, busy, onChange, onSend, onVoice, onAttach, onCancelReply, onCancelEdit, onRemoveFile, onRetryUpload, onCancelUpload }: {
  seed: Draft & { key: number }; members: ChannelDetail["members"]; me: string; reply: DraftReply | null; editing: { body: string; files: number } | null; files: DraftFile[]; uploads: Uploading[]; busy: boolean;
  onChange: (draft: Draft) => void; onSend: (draft: Draft) => void; onVoice: () => void; onAttach: () => void; onCancelReply: () => void; onCancelEdit: () => void; onRemoveFile: (file: DraftFile) => void; onRetryUpload: (id: string) => void; onCancelUpload: (id: string) => void;
}) {
  const { colors } = useTheme(), box = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [body, setBody] = useState(seed.body), [mentions, setMentions] = useState(seed.mentions), [caret, setCaret] = useState(seed.body.length);
  useEffect(() => { setBody(seed.body); setMentions(seed.mentions); setCaret(seed.body.length); if (seed.key > 0) box.current?.focus(); }, [seed]);
  useEffect(() => { if (reply) box.current?.focus(); }, [reply]);
  const people = members.filter((member) => member.userId !== me), query = mentionQuery(body, caret);
  const options = query ? people.filter((member) => member.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 5) : [];
  const ready = !busy && (!!body.trim() || (editing ? editing.files : files.length) > 0) && (editing || uploads.length === 0);
  function change(value: string, people = mentions) { setBody(value); setMentions(people); onChange({ body: value, mentions: people }); }
  function pick(member: ChannelDetail["members"][number]) {
    if (!query) return;
    const value = body.slice(0, query.start) + "@" + member.name + " " + body.slice(query.end);
    if (value.length > 4000) return;
    setCaret(query.start + member.name.length + 2);
    change(value, mentions.includes(member.userId) ? mentions : [...mentions, member.userId]);
  }
  function send() {
    if (!ready) return;
    const text = body.trim();
    onSend({ body: text, mentions: mentions.filter((id) => { const person = people.find((member) => member.userId === id); return person && showsMention(text, person.name); }) });
    if (!editing) { setBody(""); setMentions([]); setCaret(0); }
  }
  return (
    <View style={{ gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.panel }}>
      {options.length > 0 && <View accessibilityLabel="Mention a member" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" }}>{options.map((member) => <Pressable key={member.userId} accessibilityRole="button" accessibilityLabel={"Mention " + member.name} onPress={() => pick(member)} style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 10, backgroundColor: pressed ? colors.accent : colors.panel })}><Avatar name={member.name} id={member.userId} size={28} /><Text>{member.name + (member.guest ? " · Guest" : "")}</Text></Pressable>)}</View>}
      {editing ? <Banner title="Editing" text={editing.body} label="Cancel edit" onClose={onCancelEdit} /> : reply ? <Banner title={"Replying to " + reply.author} text={reply.body} label="Cancel reply" onClose={onCancelReply} /> : null}
      {!editing && (files.length > 0 || uploads.length > 0) && <View style={{ gap: 6 }}>
        {files.map((file) => <View key={file.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.muted, borderRadius: 10, paddingLeft: 10 }}><Text size={13} numberOfLines={1} style={{ flex: 1 }}>{file.fileName}</Text><Pressable accessibilityRole="button" accessibilityLabel={"Remove " + file.fileName} onPress={() => onRemoveFile(file)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={18} color={colors.foreground} /></Pressable></View>)}
        {uploads.map((item) => <View key={item.id} accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.muted, borderRadius: 10, paddingLeft: 10 }}><View style={{ flex: 1, paddingVertical: 6 }}><Text size={13} numberOfLines={1}>{item.name}</Text><Text size={13} muted={!item.error} style={item.error ? { color: colors.destructive } : undefined}>{item.error ?? "Uploading " + item.percent + "%"}</Text></View>
          {item.error && <Pressable accessibilityRole="button" accessibilityLabel={"Retry " + item.name} onPress={() => onRetryUpload(item.id)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="refresh" size={20} color={colors.foreground} /></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={"Cancel " + item.name} onPress={() => onCancelUpload(item.id)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={18} color={colors.foreground} /></Pressable></View>)}
      </View>}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
        {!editing && <Pressable accessibilityRole="button" accessibilityLabel="Attach" disabled={files.length + uploads.length >= 5} onPress={onAttach} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: files.length + uploads.length >= 5 ? 0.4 : 1 }}><Icon name="add-circle-outline" size={28} color={colors.primary} /></Pressable>}
        <TextInput ref={box} multiline maxLength={4000} value={body} accessibilityLabel={editing ? "Edit your message" : reply ? "Your reply" : "Message"} placeholder={editing ? "Edit your message…" : reply ? "Write a reply…" : "Write a message…"} placeholderTextColor={colors.mutedForeground}
          onChangeText={(value) => { setCaret((old) => old + value.length - body.length); change(value); }} onSelectionChange={(event) => setCaret(event.nativeEvent.selection.end)}
          style={{ flex: 1, minHeight: 48, maxHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: colors.foreground, backgroundColor: colors.background, textAlignVertical: "center" }} />
        {!editing && !body.trim() && !files.length && !uploads.length ? <Pressable accessibilityRole="button" accessibilityLabel="Record a voice message" onPress={onVoice} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.primaryPressed : colors.primary })}><Icon name="mic" size={23} color={colors.onPrimary} /></Pressable>
          : <Pressable accessibilityRole="button" accessibilityLabel={editing ? "Save edit" : "Send message"} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={send} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", opacity: ready ? 1 : 0.4, backgroundColor: pressed ? colors.primaryPressed : colors.primary })}><Icon name={editing ? "checkmark" : "send"} size={20} color={colors.onPrimary} /></Pressable>}
      </View>
      {body.length > 3600 && <Text muted size={13}>{body.length + "/4000"}</Text>}
    </View>
  );
}
