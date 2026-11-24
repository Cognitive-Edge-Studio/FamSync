import type { components } from "@famsync/api-client";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { ErrorText, Row, TimeField } from "@/components/form";
import { FormPage, queryState } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { accountStore } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";
import { usePhonePush } from "@/lib/push";
import { useFamilyState } from "@/lib/family";

type Preferences = components["schemas"]["NotificationPreferencesDto"];
export default function NotificationSettings() {
  const { access_token } = useSignedIn();
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/account/notification-preferences", { signal }).then(required), [access_token]);
  const query = useQuery(accountStore, "notification-preferences", load), fresh = query.savedAt ? undefined : query.data, state = queryState({ ...query, data: fresh }, { loading: "Loading settings…", failed: "Notification settings couldn’t load", lost: "Settings unavailable" });
  return <><Stack.Screen options={{ title: "Notification settings" }} />{state ?? (fresh && <Body first={fresh} />)}</>;
}
function Body({ first }: { first: Preferences }) {
  const { access_token } = useSignedIn(), { busy, error, setError, save } = useSave(), [value, setValue] = useState(first), [start, setStart] = useState(first), [note, setNote] = useState("");
  const set = (change: Partial<Preferences>) => { setNote(""); setValue((old) => ({ ...old, ...change })); };
  async function submit() {
    if (value.quietEnabled && ![value.quietStart, value.quietEnd].every((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return setError("Enter quiet hours as HH:MM.");
    if (value.quietEnabled && value.quietStart === value.quietEnd) return setError("Quiet hours need different start and end times.");
    const result = await save(() => getApi(access_token).PUT("/api/v1/account/notification-preferences", { body: value }), "We couldn’t save your notification settings. Try again.");
    if (result.ok) { setValue(result.data); setStart(result.data); setNote("Notification settings saved."); }
  }
  return (
    <FormPage dirty={JSON.stringify(value) !== JSON.stringify(start)} busy={busy} title="Save settings" onSave={() => void submit()} error={<><ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}</>}>
      <PhonePush />
      <Text muted>Reminders always appear in FamSync. Choose what also arrives by email.</Text>
      <Row multiple title="Email reminders" note="For tasks and events" selected={value.emailReminders} onPress={() => set({ emailReminders: !value.emailReminders })} />
      <Row multiple title="Email updates" note="When you’re assigned something or a schedule changes" selected={value.emailUpdates} onPress={() => set({ emailUpdates: !value.emailUpdates })} />
      <Row multiple title="Quiet hours" note="Hold emails and silence phone push until they end. In-app reminders still appear." selected={value.quietEnabled} onPress={() => set({ quietEnabled: !value.quietEnabled })} />
      {value.quietEnabled && <><TimeField label="Quiet hours start" value={value.quietStart} onChange={(quietStart) => set({ quietStart })} /><TimeField label="Quiet hours end" value={value.quietEnd} onChange={(quietEnd) => set({ quietEnd })} /></>}
      <Text muted size={13}>Quiet hours use your family’s time zone.</Text>
    </FormPage>
  );
}

function PhonePush() {
  const { status, busy, enable, disable } = usePhonePush(), { state } = useFamilyState();
  const messages = { on: 'On for this phone and your family. Lock-screen text stays generic.', off: 'Receive messages, reminders, assignments and schedule changes on this phone.', denied: 'Notifications are blocked in Android settings. Allow them, then try again.', unavailable: 'Phone notifications are not available yet. Try again after your administrator enables them.', unsupported: 'Phone push needs an Android development build installed on a physical phone.', error: 'We couldn’t update phone notifications. Check your connection and try again.' };
  return <Card><Text weight="600">Push on this phone</Text><Text muted accessibilityLiveRegion="polite">{messages[status]}</Text>
    {state.status !== 'ready' && <Text muted>Join a family to enable phone notifications.</Text>}
    {status !== 'unsupported' && <>
      <Button title={status === 'on' ? 'Turn off phone push' : 'Turn on phone push'} busy={busy} disabled={status !== 'on' && state.status !== 'ready'} onPress={status === 'on' ? disable : enable} variant="outline" />
      {status === 'error' && <Button title="Try turning off again" busy={busy} onPress={disable} variant="outline" />}
      {status === 'denied' && <Button title="Open Android settings" onPress={() => void Linking.openSettings()} variant="outline" />}
    </>}
  </Card>;
}
