import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { AuthPage } from "@/components/auth-form";
import { Button, Loading, Text } from "@/components/ui";
import { completeSignIn } from "@/lib/auth-links";

export default function AuthCallback() {
  const { code, flow, message } = useLocalSearchParams<{ code?: string; flow?: string; message?: string }>(), [text, setText] = useState("");
  const google = flow === "google";
  useEffect(() => {
    let stopped = false;
    setText("");
    if (!code) { setText(flow === "email-change" && message ? "Follow the remaining confirmation link to finish changing your email." : "This link couldn’t be confirmed. It may have expired or been used."); return; }
    completeSignIn(code, flow).then((result) => { if (!stopped) router.replace(result === "recovery" ? "/reset-password" : "/"); }, () => {
      if (!stopped) setText(google ? "Google sign-in couldn’t be completed. Try again or use your email." : "This link couldn’t be confirmed. Open it on the phone where you asked for it, or ask for a new one.");
    });
    return () => { stopped = true; };
  }, [code, flow, message, google]);
  return <AuthPage title={google ? "Google sign-in" : "Confirm your account"}>{text ? <><Text accessibilityRole="alert">{text}</Text><Button title="Continue" onPress={() => router.replace("/")} /></> : <Loading label="Checking your link…" />}</AuthPage>;
}
