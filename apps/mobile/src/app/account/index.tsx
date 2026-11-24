import type { components } from "@famsync/api-client";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { ErrorText, Field } from "@/components/form";
import { Avatar } from "@/components/message";
import { FormPage, LinkRow, queryState } from "@/components/screen";
import { Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { accountStore } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";

type Profile = components["schemas"]["ProfileDto"];
export default function AccountScreen() {
  const { access_token } = useSignedIn();
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/me/profile", { signal }).then(required), [access_token]);
  const query = useQuery(accountStore, "profile", load), state = queryState(query, { loading: "Loading your profile…", failed: "Your profile couldn’t load", lost: "Profile unavailable" });
  return <><Stack.Screen options={{ title: "Your account" }} />{state ?? (query.data && <Body profile={query.data} />)}</>;
}
function Body({ profile }: { profile: Profile }) {
  const { access_token, user } = useSignedIn(), { busy, error, save } = useSave(), first = { firstName: profile.firstName, lastName: profile.lastName, bio: profile.bio };
  const [draft, setDraft] = useState(first), [start, setStart] = useState(first), [note, setNote] = useState("");
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/me/profile/activity", { signal }).then(required), [access_token]), activity = useQuery(accountStore, "activity", load).data;
  const set = (change: Partial<typeof first>) => { setNote(""); setDraft((old) => ({ ...old, ...change })); };
  async function submit() {
    const result = await save(() => getApi(access_token).PUT("/api/v1/me/profile", { body: { firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), bio: draft.bio.trim() } }), "We couldn’t save your profile. Try again.");
    if (!result.ok) return;
    const saved = { firstName: result.data.firstName, lastName: result.data.lastName, bio: result.data.bio };
    setDraft(saved); setStart(saved); setNote("Profile saved.");
  }
  const name = [draft.firstName, draft.lastName].filter(Boolean).join(" ") || "Family member";
  return (
    <FormPage dirty={JSON.stringify(draft) !== JSON.stringify(start)} busy={busy} title="Save profile" onSave={() => void submit()} error={<><ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}</>}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><Avatar name={name} id={user.id} size={56} /><View style={{ flex: 1 }}><Text size={17} weight="600">{name}</Text><Text muted>{user.email ?? ""}</Text></View></View>
      <Card style={{ paddingVertical: 6 }}>
        <LinkRow icon="eye-outline" title="Privacy" onPress={() => router.push("/account/privacy")} />
        <LinkRow icon="notifications-outline" title="Notification settings" onPress={() => router.push("/account/notifications")} />
        <LinkRow icon="lock-closed-outline" title="Sign-in and security" onPress={() => router.push("/account/security")} />
      </Card>
      <Field label="First name" value={draft.firstName} maxLength={80} autoComplete="given-name" onChangeText={(firstName) => set({ firstName })} />
      <Field label="Last name" value={draft.lastName} maxLength={80} autoComplete="family-name" onChangeText={(lastName) => set({ lastName })} />
      <Field label="Bio" value={draft.bio} maxLength={500} multiline onChangeText={(bio) => set({ bio })} />
      {activity && <Card><Text size={17} weight="600" accessibilityRole="header">Your activity</Text><Text muted size={13}>Tasks assigned to you, or created by you while unassigned, and goals you created or are assigned.</Text>
        {([["Active tasks", activity.activeTasks], ["Completed tasks", activity.completedTasks], ["Active goals", activity.activeGoals], ["Completed goals", activity.completedGoals]] as const).map(([label, count]) => <View key={label} accessible style={{ flexDirection: "row", justifyContent: "space-between" }}><Text>{label}</Text><Text weight="600">{String(count)}</Text></View>)}</Card>}
    </FormPage>
  );
}
