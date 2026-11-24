import { router } from "expo-router";
import { useState } from "react";
import { AuthBox, AuthPage } from "@/components/auth-form";
import { ErrorText } from "@/components/form";
import { Button, Text } from "@/components/ui";
import { authMessage, getAuth } from "@/lib/auth";
import { endRecovery, isRecovering } from "@/lib/auth-links";
import { passwordProblem } from "@/lib/auth-rules";
import { useSignedIn } from "@/lib/session";

export default function ResetPassword() {
  const { user } = useSignedIn(), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!isRecovering(user.id)) return <AuthPage title="Choose a new password"><Text>Open a password reset link from your email to continue.</Text><Button title="Continue" onPress={() => router.replace("/")} /></AuthPage>;
  async function submit() {
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    setBusy(true); setError("");
    try {
      const { error: refused } = await getAuth().updateUser({ password });
      if (refused) return setError(authMessage(refused));
      endRecovery();
      router.replace("/");
    } catch { setError("We couldn’t update your password. Try again."); } finally { setBusy(false); }
  }
  return <AuthPage title="Choose a new password"><AuthBox label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" editable={!busy} /><ErrorText>{error}</ErrorText><Button title="Save new password" busy={busy} onPress={() => void submit()} /></AuthPage>;
}
