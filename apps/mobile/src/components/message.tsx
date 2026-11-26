import { attachmentOf, clockText, helperName, messageParts, receiptOf, replyText, showsMention, type ChannelDetail, type ChannelMessage, type FeedRow, type Outgoing } from "@famsync/core/chat";
import { memo, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApi } from "@/lib/api";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { Button, Icon, Text } from "./ui";
import { MediaAttachment } from './media-player';
import { useAvatarUrl } from '@/lib/avatars';

const tints = ["sage", "peach", "lavender", "sky", "rose"] as const;
export function Avatar({ name, id, size = 40 }: { name: string; id: string; size?: number }) {
  const { colors } = useTheme();
  const image=useAvatarUrl(id),[failed,setFailed]=useState<string|null>(null);
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const tint = tints[hash % tints.length], words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  const text = { sage: colors.onSage, peach: colors.onPeach, lavender: colors.onLavender, sky: colors.onSky, rose: colors.onRose }[tint];
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size, borderRadius: size / 2, overflow:'hidden', backgroundColor: colors[tint], alignItems: "center", justifyContent: "center" }}>{image&&image!==failed?<Image source={{uri:image}} style={{width:size,height:size}} onError={()=>setFailed(image)}/>:<Text size={Math.round(size * 0.36)} weight="600" style={{ color: text }}>{initials}</Text>}</View>;
}

/** The family's AI helper is shown by the emoji the family chose for it. */
export function HelperAvatar({ emoji='🌿', size = 40, full=false }: { emoji?: string; size?: number; full?:boolean }) {
  const { colors } = useTheme();
  const mascot=emoji==='🌿',source=full?require('../../assets/mascots/juniper.webp'):require('../../assets/mascots/juniper-avatar.webp');
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size, borderRadius: full?0:size/2, overflow:'hidden', backgroundColor:full&&mascot?'transparent':colors.sage, alignItems: "center", justifyContent: "center" }}>{mascot?<Image source={source} style={{width:size,height:size}} resizeMode="contain"/>:<Text size={Math.round(size * 0.5)}>{emoji}</Text>}</View>;
}

function RichText({ body, mentions, color }: { body: string; mentions: string[]; color: string }) {
  return <Text style={{ color }}>{messageParts(body, mentions).map((part, index) => part.kind === "link"
    ? <Text key={index} accessibilityRole="link" style={{ color, textDecorationLine: "underline" }} onPress={() => void Linking.openURL(part.href).catch(() => {})}>{part.text}</Text>
    : part.kind === "mention" ? <Text key={index} weight="700" style={{ color }}>{part.text}</Text> : part.text)}</Text>;
}

function Photo({ familyId, fileId, name, sticker=false }: { familyId: string; fileId: string; name: string; sticker?:boolean }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string>(), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0), [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    getApi(access_token).POST("/api/v1/families/{familyId}/files/{fileId}/preview", { params: { path: { familyId, fileId } }, signal: controller.signal })
      .then(({ data }) => { if (controller.signal.aborted) return; if (data?.url) setUrl(data.url); else setFailed(true); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
    // A new token does not need a new picture.
  }, [familyId, fileId, attempt]);
  // Links last a minute; a picture that fails once asks for a new one.
  const bad = () => { setUrl(undefined); if (attempt < 1) setAttempt(attempt + 1); else setFailed(true); };
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={(sticker?"Avatar sticker, ":"Photo, ") + name} onPress={() => { if (failed) setAttempt(attempt + 1); else if (url) { setAttempt(attempt + 1); setOpen(true); } }} style={{ width: sticker?160:230, height: sticker?160:230, borderRadius: 12, overflow: "hidden", backgroundColor: sticker?"transparent":colors.muted, alignItems: "center", justifyContent: "center" }}>
        {url ? <Image source={{ uri: url }} style={{ width: sticker?160:230, height: sticker?160:230 }} resizeMode={sticker?"contain":"cover"} onError={bad} /> : failed ? <Text muted size={13}>Tap to load photo</Text> : <ActivityIndicator color={colors.primary} />}
      </Pressable>
      {open && <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent><View accessibilityViewIsModal style={{ flex: 1, backgroundColor: "#000000f0", paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setOpen(false)} style={{ alignSelf: "flex-end", width: 56, height: 56, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={28} color="#fff" /></Pressable>
        {url ? <Image source={{ uri: url }} accessibilityLabel={name} style={{ flex: 1 }} resizeMode="contain" /> : <ActivityIndicator size="large" color="#fff" style={{ flex: 1 }} />}
      </View></Modal>}
    </>
  );
}

function FileRow({ familyId, file }: { familyId: string; file: ChannelMessage["files"][number] }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!file.fileId) return <Text muted size={13}>Attached file unavailable</Text>;
  if (file.mime?.startsWith("image/")) return <Photo familyId={familyId} fileId={file.fileId} name={file.fileName ?? "Photo"} sticker={file.sticker} />;
  if (file.mime?.startsWith('audio/') || file.mime?.startsWith('video/')) return <MediaAttachment familyId={familyId} fileId={file.fileId} name={file.voiceSeconds ? 'Voice message' : file.fileName ?? 'Media'} kind={file.mime.startsWith('audio/') ? 'audio' : 'video'} seconds={file.voiceSeconds} />;
  async function open() {
    setBusy(true);
    setError("");
    try {
      const { data } = await getApi(access_token).POST("/api/v1/families/{familyId}/files/{fileId}/download", { params: { path: { familyId, fileId: file.fileId! } } });
      if (!data) throw new Error();
      await Linking.openURL(data.url);
    } catch { setError("We couldn’t open this file."); } finally { setBusy(false); }
  }
  const label = file.voiceSeconds ? "Voice message, " + Math.floor(file.voiceSeconds / 60) + ":" + String(file.voiceSeconds % 60).padStart(2, "0") : file.fileName ?? "File";
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={"Open " + label} disabled={busy} onPress={() => void open()} style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: pressed ? colors.accent : colors.panel })}>
        <Icon name={file.voiceSeconds ? "mic-outline" : file.mime?.startsWith("video/") ? "videocam-outline" : "document-outline"} size={22} color={colors.primary} /><Text style={{ flexShrink: 1 }}>{label}</Text>{busy && <ActivityIndicator size="small" color={colors.primary} />}
      </Pressable>
      {error ? <Text size={13} accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
    </View>
  );
}

export type RowActions = { open: (message: ChannelMessage) => void; jump: (id: string) => void; reactions: (message: ChannelMessage) => void; work: (work: ChannelMessage["work"][number]) => void };

function Divider({ text, strong }: { text: string; strong?: boolean }) {
  const { colors } = useTheme();
  return <View accessible accessibilityRole="header" style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}><View style={{ flex: 1, height: 1, backgroundColor: strong ? colors.primary : colors.border }} /><Text size={13} weight={strong ? "600" : "500"} muted={!strong}>{text}</Text><View style={{ flex: 1, height: 1, backgroundColor: strong ? colors.primary : colors.border }} /></View>;
}

export const MessageRow = memo(function MessageRow({ row, channel, familyId, me, highlighted, actions }: { row: FeedRow; channel: ChannelDetail; familyId: string; me: string; highlighted: boolean; actions: RowActions }) {
  const { colors } = useTheme(), { message } = row, helper = message.fromHelper, mine = !helper && message.author?.userId === me;
  const author = helper ? helperName(channel) : message.author?.name ?? "Former member";
  const onBubble = mine ? colors.onPrimary : colors.foreground, receipt = mine && !message.deleted ? receiptOf(channel, message) : null;
  // The helper's reply mentions whoever asked; that mention isn't repeated under the text.
  const guest = !!message.author && channel.members.some((member) => member.userId === message.author!.userId && member.guest), hidden = helper ? [] : message.mentions.filter((person) => !showsMention(message.body, person.name));
  const quoted = message.replyTo ? (message.replyTo.fromHelper ? helperName(channel) : message.replyTo.author?.userId === me ? "You" : message.replyTo.author?.name ?? "Former member") : "";
  const spoken = (mine ? "You" : author) + ", " + clockText(message.createdAt) + ", " + (message.deleted ? "message deleted" : replyText({ body: message.body, deleted: false, fileCount: message.files.length, attachment: attachmentOf(message.files) })) + (receipt ? ", " + receipt : "");
  const bubble = { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: mine ? colors.primary : colors.muted, ...(mine ? { borderTopRightRadius: 6 } : { borderTopLeftRadius: 6 }) };
  return (
    <View>
      {row.day && <Divider text={row.day} />}
      {row.unread && <Divider strong text="Unread messages" />}
      <View style={{ flexDirection: mine ? "row-reverse" : "row", gap: 8, marginTop: row.grouped ? 3 : 10, borderRadius: 12, backgroundColor: highlighted ? colors.lavender : "transparent" }}>
        {!mine && (row.grouped ? <View style={{ width: 32 }} /> : helper ? <HelperAvatar emoji={channel.helper?.emoji ?? "🌿"} size={32} /> : <Avatar name={author} id={message.author?.userId ?? author} size={32} />)}
        <View style={{ maxWidth: "82%", gap: 4, alignItems: mine ? "flex-end" : "flex-start" }}>
          {!row.grouped && <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text size={13} muted>{(mine ? "" : author + (guest ? " · Guest" : "") + "  ") + clockText(message.createdAt)}</Text>
            {helper && <View style={{ borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: colors.sage }}><Text size={11} weight="600" style={{ color: colors.onSage }}>AI helper</Text></View>}
          </View>}
          {message.deleted ? <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}><Text muted style={{ fontStyle: "italic" }}>{mine ? "You deleted this message" : "This message was deleted"}</Text></View>
            : <>
              {(message.body || message.replyTo || message.forwarded || !message.files.length) ? <Pressable accessibilityLabel={spoken} accessibilityHint="Opens message actions" accessibilityActions={[{ name: "activate" }]} onAccessibilityAction={() => actions.open(message)} onLongPress={() => actions.open(message)} delayLongPress={350} style={({ pressed }) => ({ ...bubble, opacity: pressed ? 0.85 : 1 })}>
                {message.forwarded && <Text size={13} style={{ color: onBubble, fontStyle: "italic", opacity: 0.85 }}>Forwarded</Text>}
                {message.replyTo && <Pressable accessibilityRole="button" accessibilityLabel={"Show the original message from " + quoted} onPress={() => actions.jump(message.replyTo!.id)} onLongPress={() => actions.open(message)} style={{ borderLeftWidth: 3, borderLeftColor: mine ? colors.onPrimary : colors.primary, paddingLeft: 8, marginBottom: 6 }}>
                  <Text size={13} weight="600" style={{ color: onBubble }}>{quoted}</Text>
                  <Text size={13} numberOfLines={3} style={{ color: onBubble }}>{replyText(message.replyTo)}</Text></Pressable>}
                {message.body ? <RichText body={message.body} mentions={message.mentions.map((person) => person.name)} color={onBubble} /> : !message.files.length ? <Text style={{ color: onBubble, fontStyle: "italic" }}>Attachment removed</Text> : null}
                {hidden.length > 0 && <Text size={13} style={{ color: onBubble }}>{"Mentions: " + hidden.map((person) => "@" + person.name).join(", ")}</Text>}
              </Pressable> : null}
              {message.files.map((file) => <View key={file.id} style={{ flexDirection: "row", alignItems: "center" }}><FileRow familyId={familyId} file={file} /></View>)}
              {!message.body && !message.replyTo && !message.forwarded && message.files.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={"Actions for " + spoken} onPress={() => actions.open(message)} hitSlop={8}><Text muted size={13}>Actions</Text></Pressable>}
              {message.work.map((work) => <Pressable key={work.kind + work.id} accessibilityRole="button" disabled={!work.targetId} onPress={() => actions.work(work)} style={{ minHeight: 40, flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, backgroundColor: colors.panel }}>
                <Icon name={work.kind === "task" ? "checkbox-outline" : "calendar-outline"} size={18} color={colors.primary} /><Text size={13} muted={!work.targetId}>{work.title ?? "Linked " + work.kind + " unavailable"}</Text></Pressable>)}
              {message.reactions.length > 0 && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{message.reactions.map((reaction) => <Pressable key={reaction.emoji} accessibilityRole="button" accessibilityLabel={reaction.emoji + " " + reaction.count + ", show who reacted"} onPress={() => actions.reactions(message)} hitSlop={6} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: reaction.active ? colors.lavender : colors.panel }}><Text size={13}>{reaction.emoji + " " + reaction.count}</Text></Pressable>)}</View>}
              {(message.editedAt || message.starred || message.pinned || receipt) && <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {message.editedAt && <Text muted size={13}>edited</Text>}{message.starred && <Icon name="star" size={13} color={colors.mutedForeground} accessibilityLabel="Starred by you" />}{message.pinned && <Icon name="pin" size={13} color={colors.mutedForeground} accessibilityLabel="Pinned" />}
                {receipt && <Icon name={receipt === "sent" ? "checkmark" : "checkmark-done"} size={16} color={receipt === "read" ? colors.onSky : colors.mutedForeground} accessibilityLabel={receipt} />}</View>}
            </>}
        </View>
      </View>
    </View>
  );
});

export function OutgoingRow({ item, mentions, onRetry, onEdit, onDiscard }: { item: Outgoing; mentions: string[]; onRetry: () => void; onEdit: () => void; onDiscard: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "flex-end", marginTop: 10, gap: 4 }}>
      <View style={{ maxWidth: "82%", borderRadius: 18, borderTopRightRadius: 6, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.primary, opacity: item.state === "sending" ? 0.7 : 1 }}>
        {item.reply && <Text size={13} style={{ color: colors.onPrimary }} numberOfLines={2}>{item.reply.author + ": " + item.reply.body}</Text>}
        {item.body ? <RichText body={item.body} mentions={mentions} color={colors.onPrimary} /> : null}
        {item.files.map((file) => <Text key={file.id} size={13} style={{ color: colors.onPrimary }}>{file.fileName}</Text>)}
      </View>
      {item.state === "sending" ? <Text muted size={13} accessibilityLiveRegion="polite">Sending…</Text> : <View accessibilityLiveRegion="assertive" style={{ alignItems: "flex-end", gap: 6 }}>
        <Text size={13} accessibilityRole="alert" style={{ color: colors.destructive, textAlign: "right" }}>{item.error ?? "Not sent."}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}><Button variant="outline" title="Retry" onPress={onRetry} />{item.refused && <Button variant="outline" title="Edit" onPress={onEdit} />}<Button variant="outline" title="Discard" onPress={onDiscard} /></View></View>}
    </View>
  );
}
