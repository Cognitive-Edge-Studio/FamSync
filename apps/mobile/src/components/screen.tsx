import { router, useNavigation, usePreventRemove } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Family } from "@/lib/family";
import { useFamilyState } from "@/lib/family";
import type { QueryError } from "@/lib/query";
import { deviceZone, guestStore, type Scope } from "@/lib/scope";
import { useTheme } from "@/lib/theme";
import { Mascot } from "./mascot";
import { Button, Card, Icon, Loading, Notice, Text, type IconName } from "./ui";
import { MotionPressable, Reveal } from './motion';

/** Opens a screen only with the person's family, and explains loading, missing and unreachable states. */
export function WithFamily({ children }: { children: (family: Family, onLost: () => void) => ReactNode }) {
  const { state, reload } = useFamilyState();
  if (state.status === "loading") return <Loading label="Opening your family…" />;
  if (state.status === "error") return <Notice icon={state.offline ? "cloud-offline-outline" : "warning-outline"} title={state.offline ? "You’re offline" : "We couldn’t open your family"} action={{ title: "Try again", onPress: reload }}>{state.offline ? "Check your connection and try again." : "Something went wrong. Please try again."}</Notice>;
  if (state.status === "none") return <View style={{ flex: 1, justifyContent: "center" }}><View style={{ alignItems: "center" }}><Mascot size={140} /></View><Notice icon="people-outline" title="No family yet" action={{ title: "Create a family", onPress: () => router.push("/family/create") }}>Create a family, or open the invitation sent to your email. Guest channels are under More.</Notice></View>;
  return children(state.family, reload);
}

/** The same for a conversation or folder, which may be in a family the person only visits as a guest. */
export function WithScope({ familyId, children }: { familyId?: string; children: (scope: Scope) => ReactNode }) {
  const { state } = useFamilyState();
  if (familyId && state.status === "loading") return <Loading label="Opening…" />;
  if (familyId && !(state.status === "ready" && state.family.id === familyId)) return children({ id: familyId, store: guestStore, guest: true, timeZone: deviceZone() });
  return <WithFamily>{(family) => children({ id: family.id, store: family.id, guest: false, timeZone: family.timeZone })}</WithFamily>;
}

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
type Query = { data?: unknown; savedAt?: number; error?: QueryError; loading: boolean; refresh: () => void };

/** The state to show instead of data, or nothing when there is data. */
export function queryState(query: Query, labels: { loading: string; failed: string; lost: string }, onLost?: () => void) {
  if (query.error === "lost") return <Notice icon="lock-closed-outline" title={labels.lost} action={onLost ? { title: "Continue", onPress: onLost } : { title: "Go back", onPress: () => router.back() }}>It may have been removed, or you no longer have access.</Notice>;
  if (query.data !== undefined) return null;
  if (!query.error) return <Loading label={labels.loading} />;
  const offline = query.error === "offline";
  return <Notice icon={offline ? "cloud-offline-outline" : "warning-outline"} title={offline ? "You’re offline" : labels.failed} action={{ title: "Try again", onPress: query.refresh, busy: query.loading }}>{offline ? "Check your connection and try again." : "Something went wrong. Please try again."}</Notice>;
}

export function StaleNotice({ query }: { query: Query }) {
  const { colors } = useTheme();
  if (!query.error || query.data === undefined) return null;
  return (
    <Card style={{ backgroundColor: colors.peach, borderColor: colors.peach }}>
      <Text style={{ color: colors.onPeach }} accessibilityLiveRegion="polite">{(query.error === "offline" ? "You’re offline. " : "This couldn’t refresh. ") + (query.savedAt ? "Showing what was saved " + when.format(query.savedAt) + ". Changes need a connection." : "This may be out of date.")}</Text>
      <Button variant="outline" title="Try again" busy={query.loading} onPress={query.refresh} />
    </Card>
  );
}

export function Page({ query, children, footer }: { query?: Query; children: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme(), insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + (footer ? 96 : 24) }} keyboardShouldPersistTaps="handled"
        refreshControl={query ? <RefreshControl refreshing={query.loading && query.data !== undefined} onRefresh={query.refresh} colors={[colors.primary]} tintColor={colors.primary} /> : undefined}>
        {query && <StaleNotice query={query} />}
        <Reveal style={{ gap: 18 }}>{children}</Reveal>
      </ScrollView>
      {footer}
    </View>
  );
}

export function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <MotionPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ position: "absolute", right: 20, bottom: 20, minHeight: 56, borderRadius: 18, paddingHorizontal: 20, flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: pressed ? colors.primaryPressed : colors.primary, elevation: 4 })}>
      <Icon name="add" size={22} color={colors.onPrimary} /><Text weight="600" style={{ color: colors.onPrimary }}>{label}</Text>
    </MotionPressable>
  );
}

export function Chips<T extends string>({ label, value, choices, onChange }: { label: string; value: T; choices: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {choices.map((choice) => { const on = choice.value === value; return (
        <MotionPressable key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(choice.value)} style={{ minHeight: 44, borderRadius: 14, paddingHorizontal: 16, justifyContent: "center", borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.accent : colors.panel }}>
          <Text weight={on ? "600" : "400"} style={on ? { color: colors.primary } : undefined}>{choice.label}</Text></MotionPressable>); })}
    </View>
  );
}

export function Badge({ children, tone = "muted" }: { children: string; tone?: "muted" | "sage" | "sky" | "rose" | "peach" | "lavender" }) {
  const { colors } = useTheme();
  const [back, text] = tone === "muted" ? [colors.muted, colors.mutedForeground] : { sage: [colors.sage, colors.onSage], sky: [colors.sky, colors.onSky], rose: [colors.rose, colors.onRose], peach: [colors.peach, colors.onPeach], lavender: [colors.lavender, colors.onLavender] }[tone];
  return <View style={{ backgroundColor: back, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }}><Text size={13} weight="500" style={{ color: text }}>{children}</Text></View>;
}

export function LinkRow({ icon, title, note, onPress, done }: { icon: IconName; title: string; note?: string; onPress: () => void; done?: boolean }) {
  const { colors } = useTheme();
  return (
    <MotionPressable accessibilityRole="button" accessibilityLabel={title + (note ? ", " + note : "")} onPress={onPress} style={({ pressed }) => ({ minHeight: 60, flexDirection: "row", gap: 12, alignItems: "center", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 4, backgroundColor: pressed ? colors.accent : "transparent" })}>
      <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text weight="500" style={done ? { textDecorationLine: "line-through", color: colors.mutedForeground } : undefined}>{title}</Text>{note ? <Text muted size={13}>{note}</Text> : null}</View>
      <Icon name="chevron-forward" size={18} color={colors.mutedForeground} />
    </MotionPressable>
  );
}

export function Facts({ rows }: { rows: [string, string | null | undefined][] }) {
  return <>{rows.filter(([, value]) => value).map(([label, value]) => <View key={label} accessible><Text muted size={13}>{label}</Text><Text>{value}</Text></View>)}</>;
}

export function confirm(title: string, message: string, action: string, run: () => void) {
  if (Platform.OS === "web") { if (window.confirm(title + "\n" + message)) run(); return; }
  Alert.alert(title, message, [{ text: "Keep", style: "cancel" }, { text: action, style: "destructive", onPress: run }]);
}

/** A form page that asks before unsaved text is thrown away by back, a gesture or a tab. */
export function FormPage({ dirty, busy, title, onSave, error, notice, children }: { dirty: boolean; busy: boolean; title: string; onSave: () => void; error: ReactNode; notice?: ReactNode; children: ReactNode }) {
  const { colors } = useTheme(), insets = useSafeAreaInsets(), navigation = useNavigation();
  const [leaving, setLeaving] = useState<Parameters<typeof navigation.dispatch>[0]>();
  usePreventRemove(dirty && !leaving, ({ data }) => confirm("Discard changes?", "What you entered here has not been saved.", "Discard", () => setLeaving(data.action)));
  useEffect(() => { if (leaving) navigation.dispatch(leaving); }, [leaving, navigation]);
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 56} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <Reveal style={{ gap: 18 }}>{notice}{children}{error}
          <Button title={busy ? "Saving…" : title} busy={busy} onPress={onSave} />
        </Reveal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Shown after the server refused a save because someone else changed the item first. Nothing typed is lost. */
export function ConflictNotice({ changes, onUseLatest, onKeepMine }: { changes: { label: string; value: string }[]; onUseLatest: () => void; onKeepMine: () => void }) {
  const { colors } = useTheme();
  return (
    <Card accessibilityLiveRegion="assertive" style={{ backgroundColor: colors.peach, borderColor: colors.peach }}>
      <Text weight="600" style={{ color: colors.onPeach }} accessibilityRole="header">Changed on another device</Text>
      <Text style={{ color: colors.onPeach }}>Your changes were not saved, and they are still here. Saved by someone else:</Text>
      {changes.length === 0 ? <Text style={{ color: colors.onPeach }}>A detail not shown in this form.</Text> : changes.map(({ label, value }) => <Text key={label} style={{ color: colors.onPeach }}>{label + ": " + (value || "none")}</Text>)}
      <Button title="Keep my changes" onPress={onKeepMine} />
      <Button variant="outline" title="Use the saved version" onPress={onUseLatest} />
    </Card>
  );
}

export function MenuItem({ icon, title, onPress, danger, disabled }: { icon: IconName; title: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const { colors } = useTheme(), color = danger ? colors.destructive : colors.foreground;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 50, flexDirection: "row", gap: 14, alignItems: "center", paddingHorizontal: 8, borderRadius: 10, opacity: disabled ? 0.5 : 1, backgroundColor: pressed ? colors.accent : "transparent" })}><Icon name={icon} size={22} color={color} /><Text style={{ color }}>{title}</Text></Pressable>;
}
