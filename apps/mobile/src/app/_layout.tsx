import { router, SplashScreen, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Notice } from "@/components/ui";
import { VersionGate } from '@/components/version-gate';
import { ChatProvider } from "@/lib/chat";
import { FamilyProvider } from "@/lib/family";
import { pendingInvitation } from "@/lib/invitations";
import { NoticeProvider } from "@/lib/notices";
import { PushProvider } from "@/lib/push";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { closeOutboxes } from '@/lib/outboxes';
import { stopMedia } from '@/lib/media-focus';
import { MotionProvider, useMotion } from '@/lib/motion';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

void SplashScreen.preventAutoHideAsync();

/** After signing in or creating an account, an invitation opened before continues, once. */
function Invited() {
  const path = usePathname(), checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    // Signing in may still be on its way through another screen.
    if (/^.(join|reset-password|auth|sign|forgot|$)/.test(path) || path.length < 2) { if (path.startsWith("/join")) checked.current = true; return; }
    const timer = setTimeout(() => {
      checked.current = true;
      void pendingInvitation().then((saved) => { if (saved) router.push(saved.kind === "family" ? "/join" : "/join-channel"); });
    }, 300);
    return () => clearTimeout(timer);
  }, [path]);
  return null;
}

function Root() {
  const { state, retry, signOut } = useSession(), { colors, dark } = useTheme(), { reduced } = useMotion();
  const waiting = state.status === "loading", signedIn = state.status === "signedIn";
  useEffect(() => { if (!waiting) void SplashScreen.hideAsync(); }, [waiting]);
  const page = { flex: 1, backgroundColor: colors.canvas, justifyContent: "center" as const };
  if (waiting) return <View style={page} />;
  if (state.status === "offline") return (
    <View style={page}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Notice icon="cloud-offline-outline" title="You’re offline" action={{ title: "Try again", onPress: retry }}>You are still signed in. FamSync needs a connection to open your family.</Notice>
      <Notice icon="log-out-outline" title="Use another account?" action={{ title: "Sign out", onPress: () => void signOut() }} />
    </View>
  );
  if (state.status === "misconfigured") return <View style={page}><Notice icon="warning-outline" title="FamSync can’t start" action={{ title: "Try again", onPress: retry }}>This build is missing its server settings. Install an updated version.</Notice></View>;
  const screens = (
    <Stack screenOptions={{ headerShown: false, animation: reduced ? 'none' : 'fade_from_bottom', contentStyle: { backgroundColor: colors.canvas }, headerStyle: { backgroundColor: colors.canvas }, headerTitleStyle: { fontWeight: '600' }, headerTintColor: colors.foreground, headerShadowVisible: false }}>
      <Stack.Protected guard={signedIn}><Stack.Screen name="(tabs)" options={{ title: "Home" }} />{["module/[key]", "family-base/index", "family-base/record", "family-base/entry", "family-base/form", "goals", "goal/[id]", "goal/form", "task/[id]", "task/form", "event/[id]", "event/form", "chat/[id]", "chat/details", "chat/form", "chat/search", "chat/starred", "chat/guests", "files/index", "files/[id]", "files/form", "files/view", "family/index", "family/create", "family/settings", "family/invitations", "family/guests", "guests", "notifications", "push", "account/index", "account/privacy", "account/notifications", "account/security"].map((name) => <Stack.Screen key={name} name={name} options={{ headerShown: true }} />)}<Stack.Screen name="reset-password" /></Stack.Protected>
      <Stack.Protected guard={!signedIn}><Stack.Screen name="sign-in" /><Stack.Screen name="sign-up" /><Stack.Screen name="forgot-password" /></Stack.Protected>
      <Stack.Screen name="join" /><Stack.Screen name="join-channel" /><Stack.Screen name="auth/callback" />
    </Stack>
  );
  return <><StatusBar style={dark ? "light" : "dark"} />{signedIn ? <FamilyProvider key={state.session.user.id}><ChatProvider><NoticeProvider><PushProvider><Invited />{screens}</PushProvider></NoticeProvider></ChatProvider></FamilyProvider> : screens}</>;
}

function SupportedApp() {
  // If a refreshed policy blocks this binary, stop work owned by the now-hidden app; keep saved data for its replacement.
  useEffect(() => () => { closeOutboxes(); void stopMedia(); }, []);
  return <SessionProvider><Root /></SessionProvider>;
}

export default function Layout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><ThemeProvider><MotionProvider><VersionGate><SupportedApp /></VersionGate></MotionProvider></ThemeProvider></GestureHandlerRootView>;
}
