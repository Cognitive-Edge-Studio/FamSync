// Date and event rules are shared with the Android app; only web links live here.
export * from "@famsync/core/calendar-date";

export function calendarPath(familyId: string, day?: string) {
  const params = new URLSearchParams({ family: familyId });
  if (day) params.set("date", day);
  return "/calendar/?" + params.toString();
}

export function eventPath(familyId: string, eventId: string, occurrence?: string) {
  const params = new URLSearchParams({ family: familyId, id: eventId });
  if (occurrence) params.set("occurrence", occurrence);
  return "/event/?" + params.toString();
}
