import { dayInZone, eventKey, formatDay, shiftDay } from "@famsync/core/calendar-date";
import { goalProgressText } from "@famsync/core/goals";
import { router } from "expo-router";
import { useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { EventRow } from "@/components/events";
import { GoalRow } from "@/components/goals";
import { Page, queryState, WithFamily } from "@/components/screen";
import { TaskRow, useTaskStatus } from "@/components/tasks";
import { Button, Card, Icon, Text, type IconName } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSignedIn } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { agenda } from "@/lib/today";
import { ModuleIcon } from '@/components/module-icon';

export default function Today() { return <WithFamily>{(family, onLost) => <Dashboard key={family.id} family={family} onLost={onLost} />}</WithFamily>; }

function Dashboard({ family, onLost }: { family: Family; onLost: () => void }) {
  const { access_token } = useSignedIn(), { colors } = useTheme();
  const load = useCallback(async (signal: AbortSignal) => {
    const api = getApi(access_token), path = { familyId: family.id };
    const start = dayInZone(new Date(), family.timeZone);
    const [events, summary, tasks, goals] = await Promise.all([
      api.GET("/api/v1/families/{familyId}/events", { params: { path, query: { start, end: shiftDay(start, 8) } }, signal }).then(required),
      api.GET("/api/v1/families/{familyId}/tasks/summary", { params: { path, query: { scope: "mine" } }, signal }).then(required),
      api.GET("/api/v1/families/{familyId}/tasks", { params: { path, query: { due: "today", scope: "mine" } }, signal }).then(required),
      api.GET("/api/v1/families/{familyId}/goals", { params: { path, query: { scope: "all", status: "active", archived: "false", limit: 3 } }, signal }).then(required),
    ]);
    return { events, summary, tasks, goals };
  }, [access_token, family.id, family.timeZone]);
  const query = useQuery(family.id, "today", load), data = query.data, status = useTaskStatus(family.id, query.refresh);

  const state = queryState(query, { loading: "Loading today…", failed: "Today couldn’t load", lost: "You no longer have access" }, onLost);
  if (state || !data) return state;

  const timeZone = data.events.timeZone, today = dayInZone(new Date(), timeZone), days = agenda(data.events.events, timeZone, today);
  return (
    <Page query={query}>
      <Card style={{ backgroundColor: colors.accent, borderColor: colors.accent, padding: 22, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ModuleIcon name="today" size={28} /><Text size={13} weight="600" style={{ color: colors.primary }}>{formatDay(today)}</Text></View>
        <View style={{ gap: 6 }}><Text size={25} weight="700" accessibilityRole="header">{family.name}</Text><Text muted>Your family’s day, in one place.</Text></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><View style={{ flexGrow: 1, flexBasis: 120 }}><Button title="New task" icon="add-outline" onPress={() => router.push('/task/form')} /></View><View style={{ flexGrow: 1, flexBasis: 120 }}><Button title="New event" icon="calendar-outline" variant="outline" onPress={() => router.push('/event/form')} /></View></View>
      </Card>
      {status.feedback}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Stat label="Today’s plans" value={days.today.length} icon="calendar-outline" background={colors.sky} tint={colors.onSky} />
        <Stat label="Next 7 days" value={days.upcomingCount} icon="time-outline" background={colors.lavender} tint={colors.onLavender} />
        <Stat label="My open tasks" value={data.summary.todo + data.summary.inProgress} icon="checkbox-outline" background={colors.sage} tint={colors.onSage} />
        <Stat label="My overdue tasks" value={data.summary.overdue} icon="alert-circle-outline" background={data.summary.overdue ? colors.rose : colors.peach} tint={data.summary.overdue ? colors.onRose : colors.onPeach} />
      </View>
      <Section title="Due today and overdue" icon="checkbox-outline">
        {data.tasks.tasks.length === 0 ? <Text muted>Nothing is due today.</Text> : data.tasks.tasks.map((task) => <TaskRow key={task.id} task={task} today={data.tasks.today} state={status} />)}
        {data.tasks.nextCursor && <Button variant="outline" title="See all tasks" onPress={() => router.navigate("/tasks")} />}
      </Section>
      <Section title="Family agenda" icon="calendar-outline">
        {days.today.length === 0 ? <Text muted>Nothing scheduled for today.</Text> : days.today.map((event) => <EventRow key={eventKey(event)} event={event} day={today} timeZone={timeZone} />)}
      </Section>
      <Section title="Next 7 days" icon="time-outline">
        {days.upcoming.length === 0 ? <Text muted>No events planned for the next seven days.</Text> : days.upcoming.map(({ date, events }) => (
          <View key={date} style={{ gap: 8 }}><Text muted size={13} weight="600">{formatDay(date)}</Text>{events.map((event) => <EventRow key={eventKey(event)} event={event} day={date} timeZone={timeZone} />)}</View>))}
      </Section>
      <Section title="Goals" icon="flag-outline">
        {data.goals.goals.length === 0 ? <Text muted>No active goals.</Text> : data.goals.goals.map((goal) => <GoalRow key={goal.id} goal={goal} note={goalProgressText(goal)} />)}
        <Button variant="outline" title="See all goals" onPress={() => router.push("/goals")} />
      </Section>
    </Page>
  );
}

function Stat({ label, value, icon, background, tint }: { label: string; value: number; icon: IconName; background: string; tint: string }) {
  return (
    <Card accessible accessibilityLabel={label + ": " + value} style={{ flexGrow: 1, flexBasis: 140, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text size={29} weight="700">{value}</Text>
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: background, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={34} color={tint} /></View>
      </View>
      <Text muted size={13}>{label}</Text>
    </Card>
  );
}
function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  const { colors } = useTheme();
  return <Card><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 2 }}><Icon name={icon} size={20} color={colors.primary} /><Text size={17} weight="600" accessibilityRole="header" style={{ flex: 1 }}>{title}</Text></View>{children}</Card>;
}
