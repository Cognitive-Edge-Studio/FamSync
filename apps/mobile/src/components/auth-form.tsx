import { router } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { authMessage, getAuth } from "@/lib/auth";
import { callbackUrl, googleEnabled, signInWithGoogle } from "@/lib/auth-links";
import { passwordProblem, validEmail } from "@/lib/auth-rules";
import { useTheme } from "@/lib/theme";
import { ErrorText } from "./form";
import { Button, Icon, Input, Text } from "./ui";
import { Reveal } from './motion';

type Mode = "sign-in" | "sign-up" | "recovery";
const words = {
  "sign-in": { title: "Welcome back", note: "Sign in to see what’s happening with your family.", action: "Sign in", busy: "Signing in…" },
  "sign-up": { title: "Create your account", note: "Create an account to start or join a family.", action: "Create account", busy: "Creating…" },
  recovery: { title: "Reset your password", note: "We’ll email you a link to choose a new password.", action: "Send reset link", busy: "Sending…" },
};

export function AuthBox({ label, box, ...props }: React.ComponentProps<typeof TextInput> & { label: string; box?: React.Ref<ComponentRef<typeof TextInput>> }) {
  return <View style={{ gap: 8 }}><Text weight="600">{label}</Text><Input inputRef={box} {...props} accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} /></View>;
}
export function AuthPage({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors } = useTheme(), insets = useSafeAreaInsets();
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.canvas }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32, width: "100%", maxWidth: 480, alignSelf: "center" }}>
    <Reveal style={{ gap: 22 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 }}><View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="leaf" size={25} color={colors.onPrimary} /></View><Text size={20} weight="700">FamSync</Text></View>
      <View style={{ gap: 8 }}><Text size={30} weight="700" accessibilityRole="header">{title}</Text>{note && <Text muted size={16}>{note}</Text>}</View>{children}
    </Reveal></ScrollView></KeyboardAvoidingView>;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const passwordBox = useRef<ComponentRef<typeof TextInput>>(null), text = words[mode], needsPassword = mode !== "recovery";
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState(""), [google, setGoogle] = useState(false);
  useEffect(() => {
    if (!needsPassword) return;
    const controller = new AbortController();
    googleEnabled(controller.signal).then((value) => { if (!controller.signal.aborted) setGoogle(value); }, () => {});
    return () => controller.abort();
  }, [needsPassword]);
  async function run(work: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(true); setError(""); setNote("");
    try { await work(); } catch { setError(fallback); } finally { setBusy(false); }
  }
  function submit() {
    const address = email.trim(), problem = !validEmail(address) ? "Enter a valid email address." : !needsPassword ? null : !password ? "Enter your password." : mode === "sign-up" ? passwordProblem(password) : null;
    if (problem) { setNote(""); return setError(problem); }
    void run(async () => {
      const auth = getAuth();
      const { data, error: refused } = mode === "recovery" ? await auth.resetPasswordForEmail(address, { redirectTo: callbackUrl("recovery") })
        : mode === "sign-up" ? await auth.signUp({ email: address, password, options: { emailRedirectTo: callbackUrl("signup") } }) : await auth.signInWithPassword({ email: address, password });
      if (refused) return setError(authMessage(refused));
      setPassword("");
      if (mode === "recovery") setNote("If that address has an account, you’ll receive a reset link. Open it on this phone.");
      else if (mode === "sign-up" && !(data && "session" in data && data.session)) setNote("Check your email for a confirmation link. Open it on this phone.");
    }, "Sign-in is temporarily unavailable. Try again in a moment.");
  }
  return (
    <AuthPage title={text.title} note={text.note}>
      <AuthBox label="Email" value={email} onChangeText={setEmail} maxLength={254} keyboardType="email-address" autoComplete="email" textContentType="username" returnKeyType={needsPassword ? "next" : "go"} editable={!busy} onSubmitEditing={() => needsPassword ? passwordBox.current?.focus() : submit()} />
      {needsPassword && <AuthBox box={passwordBox} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === "sign-up" ? "new-password" : "current-password"} textContentType={mode === "sign-up" ? "newPassword" : "password"} returnKeyType="go" editable={!busy} onSubmitEditing={submit} />}
      <ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}
      <Button title={busy ? text.busy : text.action} busy={busy} onPress={submit} />
      {needsPassword && google && <Button variant="outline" title="Continue with Google" busy={busy} onPress={() => void run(async () => { await signInWithGoogle(); }, "Google sign-in couldn’t be completed. Try again or use your email.")} />}
      {mode === "sign-in" ? <><Button variant="outline" title="Create an account" disabled={busy} onPress={() => router.push("/sign-up")} /><Button variant="ghost" title="Forgot password?" disabled={busy} onPress={() => router.push("/forgot-password")} /></>
        : <Button variant="outline" title="Back to sign in" disabled={busy} onPress={() => router.dismissTo("/sign-in")} />}
    </AuthPage>
  );
}
