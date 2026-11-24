// Goal rules are shared with the Android app; only web links live here.
export * from "@famsync/core/goals";

export function goalsPath(familyId: string) {
  return "/goals/?" + new URLSearchParams({ family: familyId });
}

export function goalPath(familyId: string, id: string) {
  return "/goal/?" + new URLSearchParams({ family: familyId, id });
}
