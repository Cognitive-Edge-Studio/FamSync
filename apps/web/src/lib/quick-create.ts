// Quick create opens a screen with ?new=<kind>; the screen opens its own create dialog once and removes the flag,
// so refreshing or going back does not reopen it.
export type CreateKind = "task" | "event" | "goal" | "channel" | "dm";

export function takeCreateRequest(kind: CreateKind) {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get("new") !== kind) return false;
  url.searchParams.delete("new");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  return true;
}

// The family the current screen shows, published by ScheduleFamily, so quick create targets the same family.
export const currentFamilyKey = "famsyncFamily";
export function currentFamily() {
  if (typeof document === "undefined") return null;
  return document.documentElement.dataset[currentFamilyKey] ?? new URLSearchParams(window.location.search).get("family");
}
