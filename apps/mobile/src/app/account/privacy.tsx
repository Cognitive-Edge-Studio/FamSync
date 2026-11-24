import type { components } from "@famsync/api-client";
import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { ErrorText, Row, Select } from "@/components/form";
import { FormPage, queryState } from "@/components/screen";
import { Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { accountStore } from "@/lib/scope";
import { useSignedIn } from "@/lib/session";

type Ready = { defaults: components["schemas"]["PrivacyPreferencesDto"]; chat: components["schemas"]["ChatPrivacyDto"] };
const audiences = [{ value: "family", label: "Family" }, { value: "selected", label: "Selected members" }, { value: "private", label: "Only me" }] as const;
export default function PrivacyScreen() {
  const { access_token } = useSignedIn();
  const load = useCallback(async (signal: AbortSignal): Promise<Ready> => {
    const api = getApi(access_token), [defaults, chat] = await Promise.all([api.GET("/api/v1/me/privacy", { signal }).then(required), api.GET("/api/v1/me/chat-privacy", { signal }).then(required)]);
    return { defaults, chat };
  }, [access_token]);
  // Settings open only with current values, so an old copy is never saved back.
  const query = useQuery(accountStore, "privacy", load), fresh = query.savedAt ? undefined : query.data, state = queryState({ ...query, data: fresh }, { loading: "Loading privacy…", failed: "Privacy settings couldn’t load", lost: "Privacy settings unavailable" });
  return <><Stack.Screen options={{ title: "Privacy" }} />{state ?? (fresh && <Body ready={fresh} />)}</>;
}
function Body({ ready }: { ready: Ready }) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave(), [draft, setDraft] = useState(ready.defaults), [start, setStart] = useState(ready.defaults), [chat, setChat] = useState(ready.chat), [note, setNote] = useState("");
  async function submit() {
    setNote("");
    const result = await save(() => getApi(access_token).PUT("/api/v1/me/privacy", { body: draft }), "We couldn’t save your privacy preferences. Try again.");
    if (result.ok) { setDraft(result.data); setStart(result.data); setNote("Privacy preferences saved."); }
  }
  async function share(next: Ready["chat"]) {
    setNote("");
    const result = await save(() => getApi(access_token).PUT("/api/v1/me/chat-privacy", { body: next }), "We couldn’t save your chat privacy. Try again.");
    if (result.ok) { setChat(result.data); setNote("Chat privacy saved."); }
  }
  return (
    <FormPage dirty={JSON.stringify(draft) !== JSON.stringify(start)} busy={busy} title="Save defaults" onSave={() => void submit()} error={<><ErrorText>{error}</ErrorText>{note ? <Text accessibilityLiveRegion="polite">{note}</Text> : null}</>}>
      <Card><Text size={17} weight="600" accessibilityRole="header">Chat privacy</Text><Text muted size={13}>These save as you change them.</Text>
        <Row multiple title="Read receipts" note="Show others when you have read their messages. When off, you won’t see theirs either. Delivery is always shown." selected={chat.shareReceipts} onPress={() => { if (!busy) void share({ ...chat, shareReceipts: !chat.shareReceipts }); }} />
        <Row multiple title="Online, last seen and typing" note="Show your family when you are online, were last seen, or are typing. When off, you won’t see theirs either, and nothing is stored." selected={chat.sharePresence} onPress={() => { if (!busy) void share({ ...chat, sharePresence: !chat.sharePresence }); }} /></Card>
      <Text size={17} weight="600" accessibilityRole="header">Defaults for new items</Text>
      <Row multiple title="Private Mode" note="Start all new items as Only me when enabled." selected={draft.privateMode} onPress={() => setDraft({ ...draft, privateMode: !draft.privateMode })} />
      {(["calendar", "tasks", "goals"] as const).map((name) => <Select key={name} label={{ calendar: "Calendar default", tasks: "Tasks default", goals: "Goals default" }[name]} value={draft[name]} choices={[...audiences]} onChange={(value) => setDraft({ ...draft, [name]: value })} />)}
      <Text muted size={13}>You can choose a different audience when creating an item. With Selected members, you choose who can see each item.</Text>
    </FormPage>
  );
}
