import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ErrorText, Field } from "@/components/form";
import { FormPage } from "@/components/screen";
import { getApi } from "@/lib/api";
import { useFamilyState } from "@/lib/family";
import { useSave } from "@/lib/save";
import { deviceZone } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";

export default function CreateFamily() {
  const { access_token } = useSignedIn(), { reload } = useFamilyState(), { busy, error, setError, save } = useSave(), zone = deviceZone(), [name, setName] = useState(""), [timeZone, setTimeZone] = useState(zone), [done, setDone] = useState(false);
  useEffect(() => { if (done) { reload(); router.replace("/today"); } }, [done, reload]);
  async function submit() {
    if (!name.trim() || !timeZone.trim()) return setError("Enter a family name and time zone.");
    const result = await save(() => getApi(access_token).POST("/api/v1/families", { body: { name: name.trim(), timeZone: timeZone.trim() } }), "We couldn’t create your family. Try again.");
    if (result.ok) setDone(true);
  }
  return <><Stack.Screen options={{ title: "Create a family" }} /><FormPage dirty={!done && (!!name || timeZone !== zone)} busy={busy} title="Create family" onSave={() => void submit()} error={<ErrorText>{error}</ErrorText>}><Field label="Family name" value={name} maxLength={100} onChangeText={setName} /><Field label="Time zone" hint="For example America/Chicago. It sets the day and time of family plans." value={timeZone} maxLength={100} autoCapitalize="none" autoCorrect={false} onChangeText={setTimeZone} /></FormPage></>;
}
