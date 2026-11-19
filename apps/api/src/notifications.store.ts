import type { PoolClient } from "pg";
import { familyTimeZone } from "./family-time-zone.js";

export type NotificationKind = "reminder" | "assigned" | "unassigned" | "moved" | "cancelled" | 'message' | 'mention';

export type NotificationRow = {
  id: string;
  familyId: string;
  familyName: string;
  timeZone: string;
  kind: NotificationKind;
  sourceKind: "task" | "task_series" | "event" | 'conversation';
  sourceId: string;
  occurrenceKey: string;
  occurrenceTaskId: string | null;
  notificationKey: string;
  title: string;
  dueAt: Date | null;
  dateOnly: boolean;
  createdAt: Date;
  readAt: Date | null;
};

// All inbox queries use the same visibility joins, including the exact unread count.
const visibleNotifications = `
 select n.id,n.family_id as "familyId",f.name as "familyName",f.time_zone as "timeZone",n.kind,
 n.source_kind as "sourceKind",n.source_id as "sourceId",n.occurrence_key as "occurrenceKey",
 ot.id as "occurrenceTaskId",n.notification_key as "notificationKey",coalesce(t.title,ot.title,s.title,e.title) as title,
 n.due_at as "dueAt",case n.source_kind when 'task' then t.due_at is null when 'task_series' then coalesce(ot.due_at is null,s.due_time is null)
 else e.start_date is not null end as "dateOnly",n.created_at as "createdAt",n.read_at as "readAt"
 from app.notifications n join app.families f on f.id=n.family_id
 left join app.tasks t on n.source_kind='task' and t.id=n.source_id
 left join app.task_series s on n.source_kind='task_series' and s.id=n.source_id
 left join app.tasks ot on n.source_kind='task_series' and ot.series_id=n.source_id and ot.occurrence_date::text=n.occurrence_key
 left join app.calendar_events e on n.source_kind='event' and e.id=n.source_id
 where n.recipient_id=app.actor_id() and coalesce(t.title,ot.title,s.title,e.title) is not null
 union all
 select a.id,a.family_id,coalesce(f.name,'Guest channel'),coalesce(f.time_zone,'UTC'),a.kind,'conversation',c.id,m.id::text,null::uuid,a.id::text,
 case c.kind when 'dm' then 'Direct conversation' else c.name end,null::timestamptz,false,a.created_at,a.read_at
 from app.conversation_alerts a join app.channel_messages m on m.id=a.message_id
 join app.channels c on c.id=m.channel_id left join app.families f on f.id=a.family_id
 where a.recipient_id=app.actor_id()
`;
export async function readNotifications(client:PoolClient,filter:{id?:string;limit?:number}) {
 const {rows}=await client.query<NotificationRow>(`select * from (${visibleNotifications}) visible
  where ($1::uuid is null or id=$1) order by "createdAt" desc,id limit $2`,[filter.id??null,filter.limit??50]);
 return rows.map(row=>({...row,timeZone:familyTimeZone(row.timeZone)}));
}
export async function countUnreadNotifications(client:PoolClient) {
 const {rows:[row]}=await client.query<{count:number}>(`select count(*)::int as count from (${visibleNotifications}) visible where "readAt" is null`);
 return row.count;
}
// The app path for a notification's item.
export function notificationPath(row: NotificationRow) {
  const family = encodeURIComponent(row.familyId);
  if(row.sourceKind==='conversation')return '/message/?family='+family+'&conversation='+row.sourceId+'&id='+row.occurrenceKey;
  if (row.sourceKind === "event") {
    return "/event/?family=" + family + "&id=" + row.sourceId + (row.occurrenceKey ? "&occurrence=" + row.occurrenceKey : "");
  }
  const taskId = row.sourceKind === "task" ? row.sourceId : row.occurrenceTaskId;
  return taskId ? "/task/?family=" + family + "&id=" + taskId : "/tasks/?family=" + family;
}

export function notificationWhen(row: Pick<NotificationRow, "dueAt" | "dateOnly" | "timeZone">) {
  if (!row.dueAt) return null;
  const options: Intl.DateTimeFormatOptions = row.dateOnly
    ? { dateStyle: "full", timeZone: row.timeZone } : { dateStyle: "full", timeStyle: "short", timeZone: row.timeZone };
  return new Intl.DateTimeFormat("en-US", options).format(row.dueAt);
}

// The subject and sentence for a notification, used by email. The inbox shows the same wording.
export function notificationText(row: NotificationRow) {
  const when = notificationWhen(row);
  const title = row.title;
  switch (row.kind) {
    case 'message':return {subject:'New message',text:'New message in '+title};
    case 'mention':return {subject:'You were mentioned',text:'You were mentioned in '+title};
    case "assigned":
      return { subject: "Assigned to you: " + title, text: "You were assigned " + title + (when ? ", due " + when : "") };
    case "unassigned":
      return { subject: "No longer assigned: " + title, text: "You are no longer assigned " + title };
    case "moved":
      return { subject: "Moved: " + title, text: title + " moved to " + when };
    case "cancelled":
      return { subject: "Cancelled: " + title, text: title + " on " + when + " was cancelled" };
    default:
      return { subject: "Reminder: " + title, text: title + (row.sourceKind === "event" ? " starts " : " is due ") + when };
  }
}
