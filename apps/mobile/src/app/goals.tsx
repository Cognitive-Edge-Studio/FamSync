import { goalProgressText } from "@famsync/core/goals";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { GoalRow } from "@/components/goals";
import { AddButton, Badge, Chips, Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSignedIn } from "@/lib/session";

export default function Goals() { return <><Stack.Screen options={{ title: "Goals" }} /><WithFamily>{(family, onLost) => <GoalList key={family.id} family={family} onLost={onLost} />}</WithFamily></>; }

function GoalList({ family, onLost }: { family: Family; onLost: () => void }) {
  const { access_token } = useSignedIn();
  const [scope, setScope] = useState<"mine" | "all">("all"), [type, setType] = useState<"any" | "family" | "individual">("any"), [show, setShow] = useState<"active" | "completed" | "archived">("active"), [more, setMore] = useState(false);
  const page = useCallback((cursor?: string, signal?: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/goals", {
    params: { path: { familyId: family.id }, query: { scope, ...(type === "any" ? {} : { type }), ...(show === "archived" ? { archived: "true" as const } : { status: show, archived: "false" as const }), cursor, limit: 30 } }, signal }).then(required), [access_token, family.id, scope, type, show]);
  const load = useCallback(async (signal: AbortSignal) => {
    const [goals, summary] = await Promise.all([page(undefined, signal), getApi(access_token).GET("/api/v1/families/{familyId}/goals/summary", { params: { path: { familyId: family.id }, query: { scope, ...(type === "any" ? {} : { type }) } }, signal }).then(required)]);
    return { goals, summary };
  }, [page, access_token, family.id, scope, type]);
  const query = useQuery(family.id, ["goals", scope, type, show].join(":"), load), data = query.data;
  const state = queryState(query, { loading: "Loading goals…", failed: "Goals couldn’t load", lost: "You no longer have access" }, onLost);
  async function loadMore() {
    if (!data?.goals.nextCursor || more) return;
    setMore(true);
    try { const next = await page(data.goals.nextCursor); query.replace((old) => ({ ...old, goals: { ...next, goals: [...old.goals.goals, ...next.goals.filter((goal) => !old.goals.goals.some((item) => item.id === goal.id))] } })); } catch { /* It can be tried again. */ } finally { setMore(false); }
  }
  return (
    <Page query={query} footer={<AddButton label="New goal" onPress={() => router.push("/goal/form")} />}>
      <Chips label="Whose goals" value={scope} onChange={setScope} choices={[{ value: "all", label: "Family" }, { value: "mine", label: "Mine" }]} />
      <Chips label="Type" value={type} onChange={setType} choices={[{ value: "any", label: "All types" }, { value: "family", label: "Family goals" }, { value: "individual", label: "Individual" }]} />
      <Chips label="Show" value={show} onChange={setShow} choices={[{ value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "archived", label: "Archived" }]} />
      {data && <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}><Badge tone="sky">{data.summary.active + " active"}</Badge><Badge tone="sage">{data.summary.completed + " completed"}</Badge>{data.summary.average !== null && <Badge tone="lavender">{Math.round(data.summary.average) + "% average"}</Badge>}</View>}
      {state ?? <Card>
        {data!.goals.goals.length === 0 && <Text muted>No goals here.</Text>}
        {data!.goals.goals.map((goal) => <GoalRow key={goal.id} goal={goal} note={goalProgressText(goal)} />)}
        {data!.goals.nextCursor && <Button variant="outline" title="Load more" busy={more} onPress={() => void loadMore()} />}
      </Card>}
    </Page>
  );
}
