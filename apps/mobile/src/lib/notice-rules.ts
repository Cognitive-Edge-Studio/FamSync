import type { components } from "@famsync/api-client";

export type NoticeItem = components["schemas"]["NotificationDto"];
export type NoticeTarget = { pathname: "/chat/[id]" | "/event/[id]" | "/task/[id]" | "/tasks"; params: Record<string, string> };
export const noticeLabels: Record<NoticeItem["kind"], string> = { reminder: "Reminder", assigned: "Assigned to you", unassigned: "No longer assigned", moved: "Moved", cancelled: "Cancelled", message: "New message", mention: "Mention" };

export function noticeDetail(item: Pick<NoticeItem, "kind" | "summary" | "when" | "sourceKind">) {
  switch (item.kind) {
    case "message": case "mention": return item.summary;
    case "assigned": return item.when ? "Due " + item.when : "No due date";
    case "unassigned": return "Assigned to someone else or no one";
    case "moved": return "Now " + item.when;
    case "cancelled": return "Was " + item.when;
    default: return (item.sourceKind === "event" ? "Starts " : "Due ") + item.when;
  }
}

/** The screen for a notification, or null when it belongs to a family this app does not show. Guest channels are shown. */
export function noticeTarget(path: string, family: string | null, guestChannels: string[]): NoticeTarget | null {
  const [page, search] = path.split("?"), query = new URLSearchParams(search ?? ""), from = query.get("family"), id = query.get("id"), own = !!family && from === family;
  if (page === "/message/") {
    const conversation = query.get("conversation");
    if (!conversation || !id || !from) return null;
    if (own) return { pathname: "/chat/[id]", params: { id: conversation, message: id } };
    return guestChannels.includes(conversation) ? { pathname: "/chat/[id]", params: { id: conversation, message: id, family: from } } : null;
  }
  if (!own) return null;
  if (page === "/event/" && id) { const occurrence = query.get("occurrence"); return { pathname: "/event/[id]", params: { id, ...(occurrence ? { occurrence } : {}) } }; }
  if (page === "/task/" && id) return { pathname: "/task/[id]", params: { id } };
  return page === "/tasks/" ? { pathname: "/tasks", params: {} } : null;
}
