import type { PoolClient } from 'pg';
import { Temporal } from '@js-temporal/polyfill';
import { familyTimeZone } from './family-time-zone.js';
import { notificationPath, readNotifications, type NotificationRow } from './notifications.store.js';
import { quietHoursEnd } from './reminder-rules.js';

const texts: Record<NotificationRow['kind'], string> = {
  message: 'New message', mention: 'You were mentioned in a message', reminder: 'You have a reminder',
  assigned: 'Something was assigned to you', unassigned: 'An assignment changed', moved: 'An event moved', cancelled: 'An event was cancelled',
};

// Run with the recipient's RLS context immediately before delivery, for both transports.
export async function pushNotice(client: PoolClient, id: string, family: string | null, guests = true) {
  const [notification] = await readNotifications(client, { id, limit: 1 });
  if (!notification || notification.readAt || Date.now() - notification.createdAt.getTime() > 24 * 60 * 60_000) return;
  if (notification.sourceKind === 'conversation') {
    const { rows: [participant] } = await client.query<{ muted: boolean }>(
      'select muted from app.channel_participants where channel_id=$1 and user_id=app.actor_id()', [notification.sourceId]);
    if (!participant || participant.muted) return;
  }
  if (guests) {
    const { rows: [scope] } = await client.query<{ member: boolean }>(
      'select exists(select 1 from app.family_memberships where family_id=$1 and user_id=app.actor_id()) as member', [notification.familyId]);
    if (scope.member && family !== notification.familyId) return;
  } else if (family !== notification.familyId) return;
  const { rows: [quiet] } = await client.query<{ enabled: boolean; start: string; end: string }>(
    `select quiet_enabled as enabled,to_char(quiet_start,'HH24:MI') as start,to_char(quiet_end,'HH24:MI') as "end" from app.notification_preferences where user_id=app.actor_id()`);
  const chat = notification.sourceKind === 'conversation';
  return {
    title: 'FamSync', body: texts[notification.kind], path: notificationPath(notification),
    tag: chat ? 'chat:' + notification.sourceId : 'item:' + notification.id,
    silent: !!quietHoursEnd(Temporal.Now.instant(), quiet ?? { enabled: true, start: '21:00', end: '07:00' }, familyTimeZone(notification.timeZone)),
  };
}
