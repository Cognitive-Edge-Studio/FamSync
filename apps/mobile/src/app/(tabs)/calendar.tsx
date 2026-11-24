import { dayInZone, eventDays, eventKey, formatDay, shiftDay, shiftMonth } from "@famsync/core/calendar-date";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { EventRow } from "@/components/events";
import { firstOfMonth, MonthGrid, monthDays, monthLabel } from "@/components/form";
import { AddButton, Chips, Page, queryState, WithFamily } from "@/components/screen";
import { Button, Card, Text } from "@/components/ui";
import { getApi, required } from "@/lib/api";
import type { Family } from "@/lib/family";
import { useQuery } from "@/lib/query";
import { useSignedIn } from "@/lib/session";

export default function Calendar() { return <WithFamily>{(family, onLost) => <FamilyCalendar key={family.id} family={family} onLost={onLost} />}</WithFamily>; }

function FamilyCalendar({ family, onLost }: { family: Family; onLost: () => void }) {
  const { access_token } = useSignedIn(), today = dayInZone(new Date(), family.timeZone);
  const [view, setView] = useState<"agenda" | "day" | "month">("agenda"), [day, setDay] = useState(today);
  const month = firstOfMonth(day), days = useMemo(() => monthDays(month), [month]);
  // Every view uses the month's six weeks, so moving between views needs no new load.
  const load = useCallback((signal: AbortSignal) => getApi(access_token).GET("/api/v1/families/{familyId}/events", { params: { path: { familyId: family.id }, query: { start: days[0], end: shiftDay(days[41], 1) } }, signal }).then(required), [access_token, family.id, days]);
  const query = useQuery(family.id, "events:" + month, load), data = query.data;
  const state = queryState(query, { loading: "Loading calendar…", failed: "The calendar couldn’t load", lost: "You no longer have access" }, onLost);
  const byDay = useMemo(() => {
    const result = new Map<string, NonNullable<typeof data>["events"]>();
    for (const event of data?.events ?? []) {
      const { first, last } = eventDays(event, data!.timeZone);
      for (const date of days) if (first <= date && date <= last) result.set(date, [...(result.get(date) ?? []), event]);
    }
    return result;
  }, [data, days]);
  const list = (date: string) => {
    const events = byDay.get(date) ?? [];
    return events.length === 0 ? <Text muted>No events.</Text> : events.map((event) => <EventRow key={eventKey(event)} event={event} day={date} timeZone={data!.timeZone} />);
  };
  const agenda = days.filter((date) => date.slice(0, 7) === month.slice(0, 7) && date >= (month === firstOfMonth(today) ? today : month) && byDay.has(date));
  const move = (step: 1 | -1) => setDay(view === "day" ? shiftDay(day, step) : shiftMonth(month, step));
  return (
    <Page query={query} footer={<AddButton label="New event" onPress={() => router.push({ pathname: "/event/form", params: { day } })} />}>
      <Chips label="View" value={view} onChange={setView} choices={[{ value: "agenda", label: "Agenda" }, { value: "day", label: "Day" }, { value: "month", label: "Month" }]} />
      {view !== "month" && <View style={{ gap: 8 }}>
        <Text size={17} weight="600" accessibilityRole="header" accessibilityLiveRegion="polite">{view === "day" ? formatDay(day) : monthLabel(month)}</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}><Button variant="outline" title="Previous" onPress={() => move(-1)} /><Button variant="outline" title="Today" onPress={() => setDay(today)} /><Button variant="outline" title="Next" onPress={() => move(1)} /></View>
      </View>}
      {state ?? (view === "agenda" ? (agenda.length === 0 ? <Card><Text muted>{month === firstOfMonth(today) ? "No more events this month." : "No events this month."}</Text></Card>
        : agenda.map((date) => <Card key={date}><Text weight="600" accessibilityRole="header">{(date === today ? "Today, " : "") + formatDay(date)}</Text>{list(date)}</Card>))
        : view === "day" ? <Card>{list(day)}</Card>
        : <><Card><MonthGrid month={month} selected={day} today={today} onPick={setDay} onMonth={setDay} dots={(date) => byDay.get(date)?.length ?? 0} /></Card><Card><Text weight="600" accessibilityRole="header">{formatDay(day)}</Text>{list(day)}</Card></>)}
      <Text muted size={13}>{"Times use " + (data?.timeZone ?? family.timeZone) + "."}</Text>
    </Page>
  );
}
