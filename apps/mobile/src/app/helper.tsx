import type { components } from "@famsync/api-client";
import { Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorText, Field } from "@/components/form";
import { HelperAvatar } from "@/components/message";
import { MotionPressable } from "@/components/motion";
import { Chips, confirm, Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Icon, Input, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import { cache } from "@/lib/cache";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSave } from "@/lib/save";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";

type Status = components["schemas"]["FamilyHelperStatusDto"];
type Item = components["schemas"]["FamilyHelperListItemDto"];
type Fact = components["schemas"]["FamilyHelperFactDto"];
type Turn = { id: string; role: "user" | "model"; text: string; actions?: string[]; suggestions?: string[] };
type View_ = "chat" | "list" | "memory";

const emojis = ["🌿", "🦉", "🐝", "🌻", "🐢", "🤖"];
const prompts = ["Catch me up", "What’s on the shopping list?", "What’s coming up this week?", "Plan three easy dinners and add what we need"];
const actionLabels: Record<string, string> = {
  add_to_shopping_list: "Updated the shopping list", check_off_shopping_list: "Checked items off", remember: "Saved to memory",
  create_task: "Created a task", read_unread_messages: "Read your unread messages", read_family_plans: "Looked at family plans", read_shopping_list: "Read the shopping list",
};

export default function HelperScreen() {
  return <WithFamily>{(family) => <Helper key={family.id} family={family} />}</WithFamily>;
}

function Helper({ family }: { family: Family }) {
  const { access_token } = useSignedIn(), [view, setView] = useState<View_>("chat");
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), params = { path: { familyId: family.id } };
    const [status, items, facts] = await Promise.all([
      api.GET("/api/v1/families/{familyId}/helper", { params, signal }).then(required),
      api.GET("/api/v1/families/{familyId}/helper/list", { params, signal }).then(required),
      api.GET("/api/v1/families/{familyId}/helper/memory", { params, signal }).then(required),
    ]);
    return { status, items, facts };
  }, [access_token, family.id]);
  const query = useQuery(family.id, "helper", load);
  const state = queryState(query, { loading: "Loading your Family Helper…", failed: "The Family Helper couldn’t open", lost: "Family not found" });
  if (state || !query.data) return <><Stack.Screen options={{ title: "Family Helper" }} />{state}</>;
  const { status, items, facts } = query.data;
  if (!status.helper) return <><Stack.Screen options={{ title: "Adopt a family member" }} /><Page query={query}><Adopt family={family} onSaved={(next) => query.replace((old) => ({ ...old, status: next }))} /></Page></>;
  const helper = status.helper, open = items.filter((item) => !item.done).length;
  const tabs = <Chips label="Show" value={view} onChange={setView} choices={[{ value: "chat", label: "Chat" }, { value: "list", label: open ? "Shopping list (" + open + ")" : "Shopping list" }, { value: "memory", label: "Memory" }]} />;
  return (
    <>
      <Stack.Screen options={{ title: helper.name, headerTitle:()=> <View style={{flexDirection:'row',alignItems:'center',gap:8}}><HelperAvatar emoji={helper.emoji} size={30}/><Text size={17} weight="600">{helper.name}</Text></View> }} />
      {view === "chat"
        ? <Conversation family={family} status={status} header={tabs} onActions={(actions) => { if (actions.some((action) => action !== "read_unread_messages" && action !== "read_family_plans" && action !== "read_shopping_list")) query.refresh(); }} />
        : <Page query={query}>
          {tabs}
          {view === "list" ? <ShoppingList family={family} items={items} onChange={(next) => query.replace((old) => ({ ...old, items: next }))} />
            : <Memory family={family} name={helper.name} facts={facts} onChange={(next) => query.replace((old) => ({ ...old, facts: next }))} />}
          {view === "memory" && <Rename family={family} helper={helper} onSaved={(next) => query.replace((old) => ({ ...old, status: next }))} />}
        </Page>}
    </>
  );
}

function EmojiChoice({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Look" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {emojis.map((emoji) => <MotionPressable key={emoji} accessibilityRole="radio" accessibilityLabel={emoji==='🌿'?'Mascot':emoji} accessibilityState={{ checked: emoji === value }} onPress={() => onChange(emoji)}
        style={{ width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: emoji === value ? colors.primary : colors.border, backgroundColor: emoji === value ? colors.sage : colors.panel }}>
        {emoji==='🌿'?<HelperAvatar size={40}/>:<Text size={24}>{emoji}</Text>}
      </MotionPressable>)}
    </View>
  );
}

function Adopt({ family, onSaved }: { family: Family; onSaved: (status: Status) => void }) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave(), [name, setName] = useState(""), [emoji, setEmoji] = useState(emojis[0]);
  async function add() {
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/helper", { params: { path: { familyId: family.id } }, body: { name: name.trim(), emoji } }), "We couldn’t add the helper. Try again.");
    if (result.ok) onSaved(result.data);
  }
  return (
    <Card style={{ gap: 16 }}>
      <View style={{ alignItems: "center", gap: 10 }}><HelperAvatar size={128} full /><Text size={20} weight="700" accessibilityRole="header">Adopt a family member</Text>
        <Text muted style={{ textAlign: "center" }}>An AI member of your family that lives in FamSync. Give it a name and it’s ready.</Text></View>
      {["Catches you up on what you missed in your chats", "Keeps one shared shopping list", "Remembers what matters, like preferences and routines", "Joins any chat: just say its name"].map((line) =>
        <View key={line} style={{ flexDirection: "row", gap: 8 }}><Icon name="checkmark" size={18} color="#5b7a5e" /><Text style={{ flex: 1 }}>{line}</Text></View>)}
      <Field label="Name" value={name} maxLength={40} placeholder="For example, Juniper" onChangeText={setName} />
      <EmojiChoice value={emoji} onChange={setEmoji} />
      <ErrorText>{error}</ErrorText>
      <Button title="Add to the family" busy={busy} disabled={!name.trim()} onPress={() => void add()} />
    </Card>
  );
}

function Rename({ family, helper, onSaved }: { family: Family; helper: NonNullable<Status["helper"]>; onSaved: (status: Status) => void }) {
  const { access_token } = useSignedIn(), { busy, error, save } = useSave(), [open, setOpen] = useState(false), [name, setName] = useState(helper.name), [emoji, setEmoji] = useState(helper.emoji);
  if (!open) return <Button variant="outline" icon="pencil-outline" title={"Rename " + helper.name} onPress={() => setOpen(true)} />;
  async function rename() {
    const result = await save(() => getApi(access_token).PUT("/api/v1/families/{familyId}/helper", { params: { path: { familyId: family.id } }, body: { name: name.trim(), emoji } }), "We couldn’t save this. Try again.");
    if (result.ok) { onSaved(result.data); setOpen(false); }
  }
  return <Card><Field label="Name" value={name} maxLength={40} onChangeText={setName} /><EmojiChoice value={emoji} onChange={setEmoji} /><ErrorText>{error}</ErrorText>
    <Button title="Save" busy={busy} disabled={!name.trim()} onPress={() => void rename()} /><Button variant="outline" title="Cancel" disabled={busy} onPress={() => setOpen(false)} /></Card>;
}

function ShoppingList({ family, items, onChange }: { family: Family; items: Item[]; onChange: (items: Item[]) => void }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), { busy, error, save } = useSave(), [title, setTitle] = useState(""), path = { familyId: family.id };
  async function change(call: () => Promise<{ data?: Item[]; error?: unknown; response: Response }>) {
    const result = await save(call, "We couldn’t update the list. Try again.");
    if (result.ok) onChange(result.data);
  }
  const api = () => getApi(access_token);
  const add = () => { const value = title.trim(); if (!value) return; setTitle(""); void change(() => api().POST("/api/v1/families/{familyId}/helper/list", { params: { path }, body: { title: value } })); };
  const bought = items.filter((item) => item.done).length;
  return (
    <>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}><Field label="Add an item" value={title} maxLength={120} returnKeyType="done" onSubmitEditing={add} onChangeText={setTitle} /></View>
        <Button variant="tonal" title="Add" disabled={busy || !title.trim()} onPress={add} />
      </View>
      <ErrorText>{error}</ErrorText>
      <Card style={{ padding: 8, gap: 0 }}>
        {!items.length && <Text muted style={{ padding: 12 }}>Nothing on the list. Add something, or ask your helper.</Text>}
        {[...items.filter((item) => !item.done), ...items.filter((item) => item.done)].map((item) => (
          <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 56 }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done, disabled: busy }} accessibilityLabel={item.title + (item.requestedBy ? ", for " + item.requestedBy.name : "")} disabled={busy}
              onPress={() => void change(() => api().PUT("/api/v1/families/{familyId}/helper/list/{itemId}", { params: { path: { familyId: family.id, itemId: item.id } }, body: { done: !item.done } }))}
              style={({ pressed }) => ({ flex: 1, flexDirection: "row", gap: 12, alignItems: "center", padding: 8, borderRadius: 12, backgroundColor: pressed ? colors.accent : "transparent" })}>
              <Icon name={item.done ? "checkbox" : "square-outline"} size={24} color={item.done ? colors.primary : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text muted={item.done} style={item.done ? { textDecorationLine: "line-through" } : undefined}>{item.title}</Text>
                {(item.requestedBy || item.addedByHelper) && <Text muted size={13}>{(item.addedByHelper ? "✨ " : "") + (item.requestedBy ? "For " + item.requestedBy.name : "Added by the helper")}</Text>}
              </View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={"Remove " + item.title} disabled={busy} hitSlop={6}
              onPress={() => void change(() => api().DELETE("/api/v1/families/{familyId}/helper/list/{itemId}", { params: { path: { familyId: family.id, itemId: item.id } } }))}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={20} color={colors.mutedForeground} /></Pressable>
          </View>
        ))}
      </Card>
      {bought > 0 && <Button variant="outline" title={"Clear " + bought + " bought"} disabled={busy} onPress={() => void change(() => api().DELETE("/api/v1/families/{familyId}/helper/list/done", { params: { path } }))} />}
    </>
  );
}

function Memory({ family, name, facts, onChange }: { family: Family; name: string; facts: Fact[]; onChange: (facts: Fact[]) => void }) {
  const { access_token } = useSignedIn(), { colors } = useTheme(), { busy, error, save } = useSave();
  const forget = (fact: Fact) => confirm("Forget this?", fact.fact, "Forget", () => void (async () => {
    const result = await save(() => getApi(access_token).DELETE("/api/v1/families/{familyId}/helper/memory/{factId}", { params: { path: { familyId: family.id, factId: fact.id } } }), "We couldn’t remove this. Try again.");
    if (result.ok) onChange(result.data);
  })());
  return (
    <>
      <Text muted>{"Tell " + name + " things like “Sam is vegetarian” and it will remember. Remove anything you like."}</Text>
      <ErrorText>{error}</ErrorText>
      <Card style={{ padding: 8, gap: 0 }}>
        {!facts.length && <Text muted style={{ padding: 12 }}>Nothing yet.</Text>}
        {facts.map((fact) => <View key={fact.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, paddingLeft: 10 }}>
          <Text style={{ flex: 1 }} selectable>{(fact.about ? fact.about.name + ": " : "") + fact.fact}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={"Forget: " + fact.fact} disabled={busy} onPress={() => forget(fact)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="trash-outline" size={20} color={colors.mutedForeground} /></Pressable>
        </View>)}
      </Card>
    </>
  );
}

/** A direct conversation with the helper. The last turns are kept on this phone and sent back so it can follow along. */
function Conversation({ family, status, header, onActions }: { family: Family; status: Status; header: React.ReactNode; onActions: (actions: string[]) => void }) {
  const { access_token, user } = useSignedIn(), { colors } = useTheme(), insets = useSafeAreaInsets(), { busy, error, setError, save } = useSave();
  const helper = status.helper!, [turns, setTurns] = useState<Turn[]>([]), [message, setMessage] = useState(""), loaded = useRef(false), mounted = useRef(true), next = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    void cache.read<Turn[]>(user.id, family.id, "helper-chat", true).then((saved) => { if (mounted.current && saved) setTurns(saved.data); loaded.current = true; }, () => { loaded.current = true; });
  }, [user.id, family.id]);
  useEffect(() => { if (loaded.current) void cache.save(user.id, family.id, "helper-chat", turns.slice(-30)); }, [turns, user.id, family.id]);

  async function send(text: string) {
    const asked = text.trim();
    if (!asked || busy) return;
    const history = turns.slice(-10).map(({ role, text: said }) => ({ role, text: said }));
    setMessage(""); setError("");
    setTurns((old) => [...old, { id: "u" + Date.now() + ":" + next.current++, role: "user", text: asked }]);
    const result = await save(() => getApi(access_token).POST("/api/v1/families/{familyId}/helper/ask", { params: { path: { familyId: family.id } }, body: { message: asked, history } }), helper.name + " couldn’t answer. Try again.");
    if (!mounted.current) return;
    if (!result.ok) { setTurns((old) => old.slice(0, -1)); setMessage(asked); return; }
    setTurns((old) => [...old, { id: "m" + Date.now() + ":" + next.current++, role: "model", text: result.data.answer, actions: result.data.actions, suggestions: result.data.suggestions }]);
    onActions(result.data.actions);
  }

  const shown = [...turns].reverse();
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top + 56} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{header}</View>
      {!status.available && <View style={{ paddingHorizontal: 16, paddingTop: 8 }}><Text muted size={13}>{helper.name + " can’t talk yet because AI isn’t set up on the server. The shopping list and memory still work."}</Text></View>}
      <FlatList inverted data={shown} keyExtractor={(turn) => turn.id} contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={busy ? <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}><HelperAvatar emoji={helper.emoji} size={30} /><View style={{ borderRadius: 18, borderTopLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.muted }}><Text muted accessibilityLiveRegion="polite">{helper.name + " is thinking…"}</Text></View></View> : undefined}
        ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }], alignItems: "center", gap: 10, padding: 20 }}>
          <HelperAvatar emoji={helper.emoji} size={128} full /><Text size={18} weight="700">{"Hi, I’m " + helper.name + "."}</Text>
          <Text muted style={{ textAlign: "center" }}>Ask me to catch you up, sort the shopping list, or remember something for the family.</Text>
          <ScrollView horizontal={false} contentContainerStyle={{ gap: 8, alignItems: "stretch" }} style={{ alignSelf: "stretch" }}>
            {prompts.map((prompt) => <Button key={prompt} variant="outline" title={prompt} disabled={busy || !status.available} onPress={() => void send(prompt)} />)}
          </ScrollView>
        </View>}
        renderItem={({ item, index }) => {
          const mine = item.role === "user", latest = index === 0 && !mine && !busy;
          return (
            <View style={{ flexDirection: mine ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
              {!mine && <HelperAvatar emoji={helper.emoji} size={30} />}
              <View style={{ maxWidth: "82%", gap: 4, alignItems: mine ? "flex-end" : "flex-start" }}>
                <View style={{ borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: mine ? colors.primary : colors.muted, ...(mine ? { borderTopRightRadius: 6 } : { borderTopLeftRadius: 6 }) }}>
                  <Text selectable style={{ color: mine ? colors.onPrimary : colors.foreground }}>{item.text}</Text>
                </View>
                {!!item.actions?.length && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {[...new Set(item.actions)].map((action) => <View key={action} style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.sage }}><Text size={12} style={{ color: colors.onSage }}>{"✓ " + (actionLabels[action] ?? action)}</Text></View>)}
                </View>}
                {latest && !!item.suggestions?.length && <View accessibilityLabel="Suggested replies" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {item.suggestions.map((suggestion) => <Pressable key={suggestion} accessibilityRole="button" accessibilityLabel={suggestion} disabled={!status.available} onPress={() => void send(suggestion)}
                    style={({ pressed }) => ({ minHeight: 40, justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 14, backgroundColor: pressed ? colors.accent : colors.panel })}>
                    <Text size={14} weight="600" style={{ color: colors.primary }}>{suggestion}</Text>
                  </Pressable>)}
                </View>}
              </View>
            </View>
          );
        }} />
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 + insets.bottom, gap: 6, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.border }}>
        <ErrorText>{error}</ErrorText>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <Input accessibilityLabel={"Message " + helper.name} placeholder={status.available ? "Message " + helper.name : "AI isn’t set up yet"} editable={status.available} multiline maxLength={2000}
            value={message} onChangeText={setMessage} style={{ flex: 1, maxHeight: 140 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: busy || !message.trim() }} disabled={busy || !message.trim() || !status.available} onPress={() => void send(message)}
            style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.primaryPressed : colors.primary, opacity: busy || !message.trim() ? 0.5 : 1 })}>
            <Icon name="arrow-up" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>
        {turns.length > 0 && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setTurns([])} hitSlop={6}><Text muted size={13}>Start a new conversation</Text></Pressable>}
      </View>
    </KeyboardAvoidingView>
  );
}
