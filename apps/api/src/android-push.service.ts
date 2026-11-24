import { Injectable } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { DatabaseService } from './database.service.js';
import { pushNotice } from './push-notice.js';
import { PushRetryError, pushRetrySeconds } from './push-retry.js';

type Device = { id: string; familyId: string; token: string };

@Injectable()
export class AndroidPushService {
  private readonly project = process.env.FCM_PROJECT_ID?.trim() ?? '';
  private readonly email = process.env.FCM_CLIENT_EMAIL?.trim() ?? '';
  private readonly key = process.env.FCM_PRIVATE_KEY?.replaceAll('\\n', '\n') ?? '';
  private readonly auth = new JWT({
    email: this.email, key: this.key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    transporterOptions: { timeout: 8000, retry: false },
  });

  constructor(private readonly database: DatabaseService) {}

  get configured() { return !!(this.project && /^[a-z][a-z0-9-]{4,62}$/.test(this.project) && this.email && this.key); }

  async deliver(userId: string, notificationId: string, deviceId: string) {
    if (!this.configured) return;
    let token: string | null | undefined;
    try { ({ token } = await this.auth.getAccessToken()); } catch { throw new Error('Android push authorization failed'); }
    if (!token) throw new Error('Android push authorization failed');
    const found = await this.database.withActor(userId, async (client) => {
      // RLS also checks the session and current default-family membership, at send time.
      const { rows: [device] } = await client.query<Device>(
        'select id,family_id as "familyId",token from app.android_push_devices where id=$1', [deviceId]);
      const notice = device ? await pushNotice(client, notificationId, device.familyId, false) : undefined;
      return device && notice ? { device, notice } : undefined;
    });
    if (!found) return;
    const { device, notice } = found;
    try {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${this.project}/messages:send`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: {
          token: device.token,
          notification: { title: notice.title, body: notice.body },
          // Identifiers only. Resolve an authorized target when the user taps; never trust a payload URL.
          data: { notificationId, familyId: device.familyId, recipientId: userId },
          android: {
            priority: 'HIGH', ttl: '86400s', collapse_key: notice.tag,
            notification: {
              channel_id: notice.silent ? 'famsync-quiet' : 'famsync-updates', tag: notice.tag,
              visibility: 'PRIVATE', ...(notice.silent ? {} : { default_sound: true }),
            },
          },
        } }),
      });
      if (response.ok) return;
      const result = await response.json().catch(() => ({})) as { error?: { details?: { '@type'?: string; errorCode?: string }[] } };
      const details = Array.isArray(result.error?.details) ? result.error.details : [];
      const code = details.find((detail) => detail['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
      // Only explicit token errors retire a registration. A project/auth/payload error must stay retryable.
      if (code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH' || (code === 'INVALID_ARGUMENT' && !details.some((detail) => detail['@type'] === 'type.googleapis.com/google.rpc.BadRequest'))) {
        await this.database.withActor(userId, (client) => client.query('select app.remove_android_push($1,$2)', [device.id, device.token]));
        return;
      }
      if (response.status === 429 || response.status === 503) throw new PushRetryError(pushRetrySeconds(response.headers.get('Retry-After')));
      throw new Error('FCM status ' + response.status);
    } catch (error) {
      if (error instanceof PushRetryError) throw error;
      // Provider errors may contain tokens or credentials. The job persists only this neutral error.
      throw new Error('Android push delivery failed');
    }
  }
}
