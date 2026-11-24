import { Stack } from "expo-router";
import { useState } from "react";
import { AuthBox } from "@/components/auth-form";
import { ErrorText } from "@/components/form";
import { Page } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { authMessage, getAuth } from "@/lib/auth";
import { callbackUrl } from "@/lib/auth-links";
import { passwordProblem, validEmail } from "@/lib/auth-rules";
import { useSignedIn } from "@/lib/session";

export default function Security() {
  const { user } = useSignedIn();
  return <><Stack.Screen options={{ title: "Sign-in and security" }} /><Page><Text muted>{user.email ?? ""}</Text>{user.email && <><Change kind="email" email={user.email} /><Change kind="password" email={user.email} /></>}</Page></>;
}
function Change({ kind, email }: { kind: "email" | "password"; email: string }) {
  const isEmail = kind === "email", [current, setCurrent] = useState(""), [next, setNext] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [note, setNote] = useState("");
  async function submit() {
    setNote("");
    const problem = !current ? "Enter your current password." : isEmail ? (validEmail(next) ? null : "Enter a valid email address.") : passwordProblem(next);
    if (problem) return setError(problem);
    setBusy(true); setError("");
    try {
      const auth = getAuth(), login = await auth.signInWithPassword({ email, password: current });
      if (login.error) return setError(login.error.code === "invalid_credentials" ? "Check your current password and try again." : authMessage(login.error));
      const result = isEmail ? await auth.updateUser({ email: next.trim() }, { emailRedirectTo: callbackUrl("email-change") }) : await auth.updateUser({ password: next });
      if (result.error) return setError(authMessage(result.error));
      setCurrent(""); setNext("");
      setNote(isEmail ? "Check your current and new inboxes for confirmation links. Open them on this phone." : "Password updated.");
    } catch { setError("We couldn’t update your account. Try again."); } finally { setBusy(false); }
  }
  return <Card><Text size={17} weight="600" accessibilityRole="header">{"Change " + kind}</Text>
    <AuthBox label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" editable={!busy} />
    <AuthBox label={"New " + kind} value={next} onChangeText={setNext} secureTextEntry={!isEmail} keyboardType={isEmail ? "email-address" : "default"} maxLength={isEmail ? 254 : 200} autoComplete={isEmail ? "email" : "new-password"} textContentType={isEmail ? "emailAddress" : "newPassword"} editable={!busy} />
    <ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}<Button variant="outline" title={isEmail ? "Send confirmation links" : "Update password"} busy={busy} onPress={() => void submit()} /></Card>;
}
