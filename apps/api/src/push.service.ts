import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { DatabaseService } from './database.service.js';
import { pushNotice } from './push-notice.js';

type Subscription = { id: string; familyId: string | null; endpoint: string; p256dh: string; auth: string };
const vendors = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
  private readonly privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';
  private readonly subject = process.env.VAPID_SUBJECT?.trim() ?? '';
  // Local tests may name one extra host. Leave it unset everywhere else.
  private readonly testHost = process.env.PUSH_TEST_HOST?.trim() ?? '';

  constructor(private readonly database: DatabaseService) {}

  get configured() { return !!(this.publicKey && this.privateKey && this.subject); }

  // The server sends requests to this address, so only browser vendors' push services are accepted.
  allowedEndpoint(value: string) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return false;
      if (this.testHost && url.host === this.testHost) return true;
      return !url.port && vendors.some((vendor) => vendor.test(url.hostname));
    } catch { return false; }
  }

  // Checks, as the recipient and at this moment, that the notification still exists, is unread and may be shown here.
  async deliver(recipientId: string, notificationId: string, subscriptionId: string, attempt = 1) {
    if (!this.configured) return;
    const found = await this.database.withActor(recipientId, async (client) => {
      const { rows: [subscription] } = await client.query<Subscription>(
        'select id,family_id as "familyId",endpoint,p256dh,auth from app.push_subscriptions where id=$1', [subscriptionId]);
      const notice = subscription ? await pushNotice(client, notificationId, subscription.familyId) : undefined;
      return subscription && notice ? { subscription, notice } : undefined;
    });
    if (!found) return;
    const { subscription, notice } = found;
    if (!this.allowedEndpoint(subscription.endpoint)) return this.retire(recipientId, subscription.endpoint);
    const chat = notice.tag.startsWith('chat:');
    const payload = JSON.stringify(notice);
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, {
        vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey },
        TTL: 24 * 60 * 60, timeout: 8000, urgency: chat ? 'high' : 'normal',
        ...(chat ? { topic: notice.tag.slice(5).replaceAll('-', '') } : {}),
      });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // The browser or the push service says this address is finished.
      if (status === 404 || status === 410) return this.retire(recipientId, subscription.endpoint);
      // Refusals that a retry cannot change are not repeated. Addresses and payloads are never logged.
      if (status && status >= 400 && status < 500 && status !== 429 && status !== 408) {
        this.logger.warn('A push service refused a notification (' + status + ').');
        return;
      }
      throw new Error('Push delivery failed' + (status ? ' (' + status + ')' : '') + ' on attempt ' + attempt);
    }
  }

  private async retire(userId: string, endpoint: string) {
    await this.database.withActor(userId, (client) => client.query('select app.remove_push_subscription($1)', [endpoint]));
  }
}
