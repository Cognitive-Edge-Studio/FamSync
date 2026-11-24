import type { components } from "@famsync/api-client";
import type { getBrowserApi } from "./browser-auth";
import { audienceLabels, eventPath } from "./calendar-date";
import { channelPath } from "./channels";
import { folderPath } from "./files";
import { goalPath } from "./goals";
import { taskPath } from "./tasks";

export type FamilyBaseGraph = components["schemas"]["FamilyBaseGraphDto"];
export type FamilyBaseRecord = components["schemas"]["FamilyBaseNodeDto"];
export type FamilyEntry = components["schemas"]["FamilyEntryDto"];
export type EntryKind = FamilyEntry["kind"];
export type EntryLinkKind = FamilyEntry["links"][number]["kind"];
export const entryKinds = ["memory", "place", "idea"] as const satisfies readonly EntryKind[];
export type FamilyBaseKind = FamilyBaseRecord["kind"];
export type FamilyBaseRelation = components["schemas"]["FamilyBaseLinkDto"]["relation"];

/** One constellation per record kind. Colors keep the original demo palette: dark-mode glow, light-mode ink. */
export const universeGroups = [
  { id: "person", label: "People", singular: "Person", color: "#94d7b0", light: "#3f875d", center: [-130, 65, 20] },
  { id: "task", label: "Tasks", singular: "Task", color: "#8bbfff", light: "#3973b2", center: [115, 90, -50] },
  { id: "goal", label: "Goals", singular: "Goal", color: "#bea7ff", light: "#8060b3", center: [20, -115, 85] },
  { id: "event", label: "Events", singular: "Event", color: "#f0bd83", light: "#b77a32", center: [-85, -55, -115] },
  { id: "conversation", label: "Chats", singular: "Conversation", color: "#ed9eae", light: "#ba627b", center: [125, -35, 100] },
  { id: "file", label: "Files", singular: "File", color: "#7dd9d3", light: "#348b8a", center: [-30, 120, -95] },
  { id: "memory", label: "Memories", singular: "Memory", color: "#f2d479", light: "#8a6d1f", center: [-150, -80, 80] },
  { id: "place", label: "Places", singular: "Place", color: "#e6a0e0", light: "#9a4a92", center: [70, -130, -110] },
  { id: "idea", label: "Ideas", singular: "Idea", color: "#c8e27a", light: "#66801f", center: [-15, 75, 165] },
] as const satisfies readonly { id: FamilyBaseKind; label: string; singular: string; color: string; light: string; center: readonly [number, number, number] }[];

export type UniverseGroup = FamilyBaseKind;
export type UniverseNode = {
  id: string; name: string; group: UniverseGroup | "home"; val: number; hub: boolean;
  record?: FamilyBaseRecord;
  x?: number; y?: number; z?: number; fx?: number; fy?: number; fz?: number;
};
export type UniverseLink = { source: string | UniverseNode; target: string | UniverseNode; kind: "cluster" | "connection"; relation?: FamilyBaseRelation };
export const endpointId = (endpoint: string | UniverseNode) => typeof endpoint === "string" ? endpoint : endpoint.id;

const relationLabels: Record<FamilyBaseRelation, string> = {
  assigned: "Assigned", created: "Created by", "goal-step": "Goal step", event: "For event", participant: "Member", "shared-in": "Shared in", linked: "Linked",
};
export const relationLabel = (relation?: FamilyBaseRelation) => relation ? relationLabels[relation] : "Part of";

/**
 * Turns the API graph into renderer data: a fixed family hub, one fixed hub per kind, and records scattered
 * deterministically around their hub. Records with no relationships still hang off their hub, so nothing floats free.
 */
export function toUniverse(graph: FamilyBaseGraph): { nodes: UniverseNode[]; links: UniverseLink[] } {
  const nodes: UniverseNode[] = [{ id: "home", name: graph.familyName, group: "home", val: 7, hub: true, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 }];
  const links: UniverseLink[] = [];
  const counts = new Map<FamilyBaseKind, number>();
  for (const record of graph.nodes) counts.set(record.kind, (counts.get(record.kind) ?? 0) + 1);
  for (const group of universeGroups) {
    if (!counts.get(group.id)) continue;
    const [x, y, z] = group.center;
    nodes.push({ id: group.id, name: group.label, group: group.id, val: 4, hub: true, x, y, z, fx: x, fy: y, fz: z });
    links.push({ source: "home", target: group.id, kind: "cluster" });
  }
  const degree = new Map<string, number>();
  for (const link of graph.links) for (const id of [link.source, link.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
  for (const record of graph.nodes) {
    const [x, y, z] = universeGroups.find((group) => group.id === record.kind)!.center;
    const random = seeded(record.id);
    const spread = 60 + Math.min(60, (counts.get(record.kind) ?? 1) * 1.5);
    nodes.push({
      id: record.id, name: record.name, group: record.kind, hub: false, record,
      val: record.kind === "person" ? 2.6 : Math.min(2.2, .8 + (degree.get(record.id) ?? 0) * .25),
      x: x + (random() - .5) * spread, y: y + (random() - .5) * spread, z: z + (random() - .5) * spread,
    });
    links.push({ source: record.kind, target: record.id, kind: "cluster" });
  }
  for (const link of graph.links) links.push({ source: link.source, target: link.target, kind: "connection", relation: link.relation });
  return { nodes, links };
}

function seeded(text: string) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function recordHref(familyId: string, record: FamilyBaseRecord): string | null {
  switch (record.kind) {
    case "task": return taskPath(familyId, record.recordId);
    case "goal": return goalPath(familyId, record.recordId);
    case "event": return eventPath(familyId, record.recordId);
    case "conversation": return channelPath(familyId, record.recordId, record.status === "dm" ? "dm" : "channel");
    case "file": return record.folderId ? folderPath(familyId, record.folderId) : null;
    case "person": return "/family/?" + new URLSearchParams({ id: familyId });
    case "memory": case "place": case "idea": return null;
  }
}

export function openLabel(kind: FamilyBaseKind) {
  return { person: "Open family", task: "Open task", goal: "Open goal", event: "Open event", conversation: "Open chat", file: "Open folder", memory: "Open", place: "Open", idea: "Open" }[kind];
}

const taskStatus: Record<string, string> = { todo: "To do", in_progress: "In progress", completed: "Done" };
const fileTypes: Record<string, string> = {
  "application/pdf": "PDF", "image/jpeg": "JPEG image", "image/png": "PNG image", "image/webp": "WebP image", "text/plain": "Text file", "text/csv": "CSV file",
};

function formatWhen(value: string, timeZone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

const entryAudience = (record: FamilyBaseRecord) => audienceLabels[(record.status ?? "family") as keyof typeof audienceLabels];

/** Short facts for the details panel, formatted in the family's time zone. */
export function recordFacts(record: FamilyBaseRecord, timeZone: string): string[] {
  const when = record.when ? formatWhen(record.when, timeZone) : null;
  switch (record.kind) {
    case "person": return [record.you ? "You" : "Family member", record.status === "owner" ? "Family owner" : ""].filter(Boolean);
    case "task": return [taskStatus[record.status ?? ""] ?? "Task", when ? "Due " + when : "No due date", record.repeats ? "Repeating chore" : ""].filter(Boolean);
    case "goal": return [record.status === "completed" ? "Completed" : "Active", record.progress !== null ? record.progress + "% complete" : "", when ? "Target " + when : ""].filter(Boolean);
    case "event": return [when ? (record.repeats ? "Starts " : "") + when : "", record.repeats ? "Repeats" : ""].filter(Boolean);
    case "conversation": return [record.status === "dm" ? "Direct message" : "Channel"];
    case "file": return [fileTypes[record.status ?? ""] ?? "File", when ? "Added " + when : ""].filter(Boolean);
    case "memory": return [when ?? "", entryAudience(record)].filter(Boolean);
    case "place": return [record.location ?? "", entryAudience(record)].filter(Boolean);
    case "idea": return [entryAudience(record)];
  }
}

export async function loadFamilyBaseGraph(api: ReturnType<typeof getBrowserApi>, familyId: string, signal: AbortSignal) {
  const { data, response } = await api.GET("/api/v1/families/{familyId}/base/graph", { params: { path: { familyId } }, signal });
  if (!data) throw new Error(response.status === 404 ? "not-found" : "unavailable");
  return data;
}
