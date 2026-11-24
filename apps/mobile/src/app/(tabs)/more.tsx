import { router } from "expo-router";
import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import { MotionPressable, Reveal } from '@/components/motion';
import { Page } from '@/components/screen';
import { Button, Card, Icon, Text } from "@/components/ui";
import { useChats } from "@/lib/chat";
import { useFamilyState } from "@/lib/family";
import { shownModules } from "@/lib/modules";
import { useNotices } from "@/lib/notices";
import { useSession, useSignedIn } from "@/lib/session";
import { themeChoices, useTheme } from "@/lib/theme";

const paths = { goals: "/goals", files: "/files", family: "/family", guests: "/guests", notifications: "/notifications", 'family-base': '/family-base' } as const;
const labels = { light: "Light", dark: "Dark", system: "Device" };
const descriptions: Record<string, string> = { goals: 'Make progress together', files: 'Everything you’ve shared', family: 'Your people and settings', guests: 'Your invited spaces', notifications: 'Catch up on updates', 'family-base': 'Memories, places and ideas' };

export default function More() {
  const { colors, choice, choose } = useTheme(), { signOut } = useSession(), session = useSignedIn(), { state } = useFamilyState();
  const { guestUnread } = useChats(), { unread } = useNotices(), counts: Record<string, number> = { guests: guestUnread, notifications: unread };
  const [busy, setBusy] = useState(false);
  const extra = shownModules(__DEV__ && process.env.EXPO_PUBLIC_SHOW_UNBUILT === "1").filter((module) => !module.tab);
  async function leave() {
    setBusy(true);
    try { await signOut(); } finally { setBusy(false); }
  }
  const confirm = () => Platform.OS === "web" ? void leave() : Alert.alert("Sign out?", "FamSync will remove your session from this device.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => void leave() }]);
  return (
    <Page>
      <Card style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View style={{ width: 50, height: 50, borderRadius: 18, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' }}><Icon name="person-outline" size={25} color={colors.primary} /></View>
          <View style={{ flex: 1, gap: 3 }}><Text size={17} weight="700" accessibilityRole="header">Your space</Text><Text muted size={13} selectable>{session.user.email}</Text>{state.status === 'ready' && <Text muted size={13}>{state.family.name}</Text>}</View>
        </View>
        <Button variant="tonal" title="Your account" icon="settings-outline" onPress={() => router.push('/account')} />
      </Card>
      <Text size={18} weight="700" accessibilityRole="header">Explore</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {extra.map((module, index) => <Reveal key={module.key} delay={index * 25} style={{ flexGrow: 1, flexBasis: 145 }}>
          <MotionPressable accessibilityRole="button" accessibilityLabel={module.title + (counts[module.key] ? ', ' + counts[module.key] + ' unread' : '')}
            onPress={() => { const path = module.built ? paths[module.key as keyof typeof paths] : undefined; if (path) router.push(path as Parameters<typeof router.push>[0]); else router.push({ pathname: '/module/[key]', params: { key: module.key } }); }}
            style={({ pressed }) => ({ minHeight: 144, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.accent : colors.panel })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: index % 3 === 0 ? colors.sage : index % 3 === 1 ? colors.sky : colors.lavender }}><Icon name={module.icon} size={38} color={index % 3 === 0 ? colors.onSage : index % 3 === 1 ? colors.onSky : colors.onLavender} /></View>
              {counts[module.key] ? <View style={{ borderRadius: 12, minWidth: 24, padding: 4, backgroundColor: colors.primary }}><Text size={12} weight="600" style={{ textAlign: 'center', color: colors.onPrimary }}>{String(counts[module.key])}</Text></View> : <Icon name="chevron-forward" size={16} color={colors.mutedForeground} />}</View>
            <View style={{ gap: 4 }}><Text weight="600">{module.title}</Text><Text muted size={12}>{descriptions[module.key] ?? 'Open module'}</Text></View>
          </MotionPressable>
        </Reveal>)}
      </View>
      <Card>
        <Text size={17} weight="600" accessibilityRole="header">Appearance</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {themeChoices.map((value) => (
            <MotionPressable key={value} accessibilityRole="radio" accessibilityLabel={value === 'system' ? 'Match device' : labels[value]} accessibilityState={{ checked: choice === value }} onPress={() => choose(value)} style={{ minHeight: 64, flexGrow: 1, flexBasis: 76, padding: 12, gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: choice === value ? colors.primary : colors.border, backgroundColor: choice === value ? colors.accent : colors.panel }}>
              <Icon name={value === 'light' ? 'sunny-outline' : value === 'dark' ? 'moon-outline' : 'phone-portrait-outline'} size={20} color={choice === value ? colors.primary : colors.mutedForeground} /><Text size={13} weight={choice === value ? '600' : '400'}>{labels[value]}</Text>
            </MotionPressable>
          ))}
        </View>
      </Card>
      <Button variant="outline" title={busy ? "Signing out…" : "Sign out"} icon="log-out-outline" busy={busy} onPress={confirm} />
    </Page>
  );
}
