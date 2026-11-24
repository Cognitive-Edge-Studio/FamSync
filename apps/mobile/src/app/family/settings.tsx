import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ErrorText, Field } from "@/components/form";
import { FormPage, WithFamily } from "@/components/screen";
import { Notice } from "@/components/ui";
import { getApi } from "@/lib/api";
import { useFamilyState, type Family } from "@/lib/family";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";

export default function FamilySettings() { return <><Stack.Screen options={{ title: "Family settings" }} /><WithFamily>{(family) => family.role === "owner" ? <Body key={family.id} family={family} /> : <Notice icon="lock-closed-outline" title="Only the owner can change settings" action={{ title: "Go back", onPress: () => router.back() }} />}</WithFamily></>; }
function Body({ family }: { family: Family }) {
  const { access_token } = useSignedIn(), { replace } = useFamilyState(), { busy, error, setError, save } = useSave(), [name, setName] = useState(family.name), [timeZone, setTimeZone] = useState(family.timeZone), [saved, setSaved] = useState<Family>();
  useEffect(() => { if (saved) { replace(saved); router.back(); } }, [saved, replace]);
  async function submit() {
    if (!name.trim() || !timeZone.trim()) return setError("Enter a family name and time zone.");
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/settings", { params: { path: { familyId: family.id } }, body: { name: name.trim(), timeZone: timeZone.trim() } }), "We couldn’t update your family settings. Try again.");
    if (result.ok) setSaved(result.data);
  }
  return <FormPage dirty={!saved && (name !== family.name || timeZone !== family.timeZone)} busy={busy} title="Save settings" onSave={() => void submit()} error={<ErrorText>{error}</ErrorText>}><Field label="Family name" value={name} maxLength={100} onChangeText={setName} /><Field label="Time zone" hint="Changing it changes the day and time shown for family plans." value={timeZone} maxLength={100} autoCapitalize="none" autoCorrect={false} onChangeText={setTimeZone} /></FormPage>;
}
