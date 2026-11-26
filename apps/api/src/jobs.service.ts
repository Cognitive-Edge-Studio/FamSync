import { Injectable, Logger } from "@nestjs/common";
import { Inngest } from "inngest";
import type { PoolClient } from "pg";
import { invitationToken } from "./invitation-token.js";
import { InvitationMailService } from "./invitation-mail.service.js";
import { JobsDatabaseService } from "./jobs-database.service.js";
import { claimOutbox, completeOutbox, failOutbox, type OutboxRow } from "./outbox.store.js";
import type { SourceKind } from "./reminder-planner.js";
import type { ChangeNotice } from "./reminder-queue.js";
import { RemindersService } from "./reminders.service.js";
import { ChannelRealtimeService } from "./channel-realtime.service.js";
import {AttachmentStorageService} from './attachment-storage.service.js';
import { PushService } from './push.service.js';
import { AndroidPushService } from './android-push.service.js';
import { PushRetryError } from './push-retry.js';

export const outboxEvent = "famsync/outbox.pending";
const batchSize = 20;
const liveKinds = ["conversation.notice", "channel.refresh"];
const pushKinds = ["push.send"];

type Handler = (client: PoolClient, row: OutboxRow) => Promise<void>;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  readonly inngest = new Inngest({ id: "famsync" });
  private readonly handlers: Record<string, Handler> = {
    'storage.cleanup':async(client,row)=>{const id=String(row.payload.fileId);const{rows:[r]}=await client.query<{key:string|null}>('select app.claim_file_cleanup($1) as key',[id]);if(!r.key)return;await this.storage.removeFile(r.key);await client.query('select app.finish_file_cleanup($1)',[id]);},
    'guest.invitation.email':async(client,row)=>{
      const id=String(row.payload.invitationId),attempt=String(row.payload.attempt);
      const {rows:[invite]}=await client.query<{email:string;name:string}>('select email,channel_name as name from app.guest_invitation_for_delivery($1,$2)',[id,attempt]);
      if(!invite)return;
      const status=await this.mail.sendGuest(invite.email,invite.name,invitationToken(attempt),attempt);
      await client.query('select app.record_guest_delivery($1,$2,$3)',[id,attempt,status]);
      if(status==='failed')throw new Error('Guest invitation email delivery failed');
    },
    "conversation.notice": async(client,row)=>{await client.query('select app.deliver_conversation_notice($1)',[String(row.payload.messageId)]);},
    "push.send": (_client, row) => row.payload.transport === 'android'
      ? this.androidPush.deliver(String(row.payload.recipientId), String(row.payload.notificationId), String(row.payload.subscriptionId))
      : this.push.deliver(String(row.payload.recipientId), String(row.payload.notificationId), String(row.payload.subscriptionId), row.attempts),
    "channel.refresh": (client, row) => this.channelRealtime.publish(client, String(row.payload.channelId), Array.isArray(row.payload.users) ? row.payload.users.map(String) : undefined),
    "invitation.email": (client, row) => this.sendInvitation(client, row),
    "reminders.plan": async (_client, row) => {
      await this.reminders.plan(row.payload.sourceKind as SourceKind, String(row.payload.sourceId), String(row.payload.authorId));
    },
    "notification.change": (_client, row) =>
      this.reminders.deliverChange(row.id, row.familyId!, row.payload as unknown as ChangeNotice),
    "notification.email": (_client, row) =>
      this.reminders.sendEmail(String(row.payload.notificationId), String(row.payload.recipientId)),
  };

  constructor(
    private readonly database: JobsDatabaseService,
    private readonly mail: InvitationMailService,
    private readonly reminders: RemindersService,
    private readonly channelRealtime: ChannelRealtimeService,
    private readonly storage:AttachmentStorageService,
    private readonly push: PushService,
    private readonly androidPush: AndroidPushService,
  ) {}

  /**
   * Lets a feature service handle its own job kind without the two services depending on each other.
   * `immediate` kinds also run right after `notify()` in their own lane, like push, instead of waiting for the scheduler.
   */
  register(kind: string, handler: Handler, options: { immediate?: boolean } = {}) {
    this.handlers[kind] = handler;
    if (options.immediate) this.immediateKinds.push(kind);
  }
  private readonly immediateKinds: string[] = [];
  private runningImmediate = false;
  private runImmediateAgain = false;
  private async runImmediate() {
    this.runImmediateAgain = true;
    if (this.runningImmediate || !this.immediateKinds.length || !this.database.configured) return;
    this.runningImmediate = true;
    try {
      while (this.runImmediateAgain) {
        this.runImmediateAgain = false;
        while ((await this.dispatch(this.immediateKinds)).processed > 0);
      }
    } catch {
      this.logger.warn("Could not run queued work now. It will run on the next scheduled pass.");
    } finally {
      this.runningImmediate = false;
    }
  }

  // Inngest runs the dispatcher after each commit and every minute as a safety net. A run that fails in
  // transport is retried. Dispatching is safe to repeat because claims and the outbox carry the state.
  functions() {
    // JOBS_POLL_CRON slows the safety-net polls on free scheduler plans (e.g. "*/5 * * * *"); reminders then arrive up to that late.
    const poll = process.env.JOBS_POLL_CRON?.trim() || "* * * * *";
    return [
      this.inngest.createFunction(
        { id: "dispatch-outbox", triggers: [{ event: outboxEvent }, { cron: poll }], retries: 3 },
        async ({ step }) => step.run("dispatch", () => this.dispatch().finally(() => void this.pushNow())),
      ),
      // Due reminders are checked on the poll schedule (every minute by default). Each one is rechecked against its item before it is sent.
      this.inngest.createFunction(
        { id: "deliver-reminders", triggers: [{ cron: poll }], retries: 3 },
        async ({ step }) => step.run("deliver", () => this.reminders.deliverDue().finally(() => void this.pushNow())),
      ),
      // Hourly re-planning keeps a 14-day horizon for repeating events and chores.
      this.inngest.createFunction(
        { id: "plan-reminders", triggers: [{ cron: "7 * * * *" }], retries: 3 },
        async ({ step }) => step.run("plan", () => this.reminders.planAll()),
      ),
    ];
  }

  // Chat signals go out from here at once; anything left over is picked up by the scheduled pass.
  private signalling = false;
  private signalAgain = false;
  private async signalNow() {
    this.signalAgain = true;
    if (this.signalling || !this.database.configured) return;
    this.signalling = true;
    try {
      while (this.signalAgain) {
        this.signalAgain = false;
        // Delivering an alert queues a refresh, so run until nothing is left.
        while ((await this.dispatch(liveKinds)).processed > 0);
      }
    } catch {
      this.logger.warn("Could not send live updates now. They will run on the next scheduled pass.");
    } finally {
      this.signalling = false;
    }
    void this.pushNow();
  }

  // Push goes out in its own lane, so a slow push service never delays live updates.
  private pushing = false;
  private async pushNow() {
    if (this.pushing || !this.database.configured) return;
    this.pushing = true;
    try {
      while ((await this.dispatch(pushKinds)).processed > 0);
    } catch {
      this.logger.warn("Could not send push now. It will run on the next scheduled pass.");
    } finally {
      this.pushing = false;
    }
  }

  // Asks Inngest to dispatch now. If Inngest is unreachable, the cron run picks the work up on its next pass.
  // Callers do not wait: the work is already saved.
  async notify() {
    void this.signalNow();
    void this.runImmediate();
    void this.signalScheduler();
  }

  private async signalScheduler() {
    try {
      await this.inngest.send({ name: outboxEvent, data: {} });
    } catch {
      this.logger.warn("Could not signal the job runner. Queued work will run on the next scheduled pass.");
    }
  }

  async dispatch(kinds = Object.keys(this.handlers)) {
    if (!this.database.configured) return { processed: 0, failed: 0 };
    let processed = 0;
    let failed = 0;
    for (;;) {
      const rows = await this.database.withClient((client) => claimOutbox(client, kinds, batchSize));
      if (!rows.length) break;
      for (const row of rows) {
        const ok = await this.database.withClient((client) => this.process(client, row));
        processed += 1;
        if (!ok) failed += 1;
      }
      if (rows.length < batchSize) break;
    }
    return { processed, failed };
  }

  private async process(client: PoolClient, row: OutboxRow) {
    const context = "job " + row.id + " (" + row.kind + ", attempt " + row.attempts + ", request " + (row.requestId ?? "none") + ")";
    try {
      await this.handlers[row.kind](client, row);
      await completeOutbox(client, row.id);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = await failOutbox(client, row.id, message, error instanceof PushRetryError ? error.retrySeconds : 0);
      if (status === "dead") this.logger.error("Gave up on " + context + ": " + message);
      else this.logger.warn("Will retry " + context + ": " + message);
      return false;
    }
  }

  // Sends one invitation email. A replaced, accepted, revoked, or expired invitation needs no email.
  private async sendInvitation(client: PoolClient, row: OutboxRow) {
    const invitationId = String(row.payload.invitationId);
    const attempt = String(row.payload.attempt);
    const { rows: [invitation] } = await client.query<{ email: string; familyName: string }>(
      'select email, family_name as "familyName" from app.invitation_for_delivery($1, $2)', [invitationId, attempt],
    );
    if (!invitation) return;
    const status = await this.mail.send(invitation.email, invitation.familyName, invitationToken(attempt), attempt);
    await client.query("select app.record_invitation_delivery($1, $2, $3)", [invitationId, attempt, status]);
    if (status === "failed") throw new Error("Invitation email delivery failed");
  }
}
