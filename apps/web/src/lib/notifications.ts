import type { components } from "@famsync/api-client";

export type NotificationList = components["schemas"]["NotificationListDto"];
export type Notification = components["schemas"]["NotificationDto"];

export const kindLabels: Record<Notification["kind"], string> = {
  reminder: "Reminder", assigned: "Assigned to you", unassigned: "No longer assigned", moved: "Moved", cancelled: "Cancelled", message: "New message", mention: "Mention",
};

export function notificationDetail(item: Notification) {
  switch (item.kind) {
    case "message": case "mention": return item.summary;
    case "assigned": return item.when ? "Due " + item.when : "No due date";
    case "unassigned": return "Assigned to someone else or no one";
    case "moved": return "Now " + item.when;
    case "cancelled": return "Was " + item.when;
    default: return (item.sourceKind === "event" ? "Starts " : "Due ") + item.when;
  }
}

// Tells the bell and any open inbox to refresh their unread state.
export const announceNotifications = () => window.dispatchEvent(new Event("famsync:notifications"));
