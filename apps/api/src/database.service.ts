import { Injectable, Logger, ServiceUnavailableException, type OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import { currentRequestId } from "./request-context.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool | undefined;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;

    this.pool = new Pool({
      connectionString,
      connectionTimeoutMillis: 1500,
      query_timeout: 2000,
      max: 5,
    });
    this.pool.on("error", () => this.logger.warn("An idle database connection closed unexpectedly."));
  }

  async isReady(): Promise<boolean> {
    if (!this.pool) return false;

    try {
      const result = await this.pool.query<{ ready: boolean }>(`
        select current_user = 'famsync_api'
          and row_security_active('app.families'::regclass)
          and row_security_active('app.profiles'::regclass)
          and row_security_active('app.family_memberships'::regclass)
          and row_security_active('app.family_invitations'::regclass)
          and row_security_active('app.privacy_preferences'::regclass)
          and row_security_active('app.calendar_events'::regclass)
          and row_security_active('app.event_attachments'::regclass)
          and row_security_active('app.calendar_occurrence_changes'::regclass)
          and row_security_active('app.tasks'::regclass)
          and row_security_active('app.task_series'::regclass)
          and row_security_active('app.goals'::regclass)
          and row_security_active('app.goal_checklist_items'::regclass)
          and row_security_active('app.channels'::regclass)
          and row_security_active('app.channel_messages'::regclass)
          and row_security_active('app.channel_participants'::regclass)
          and row_security_active('app.channel_reactions'::regclass)
          and row_security_active('app.conversation_alerts'::regclass)
          and row_security_active('app.channel_guest_grants'::regclass)
          and row_security_active('app.channel_guest_invitations'::regclass)
          and row_security_active('app.folders'::regclass)
          and row_security_active('app.stored_files'::regclass)
          and row_security_active('app.message_file_links'::regclass)
          and row_security_active('app.message_event_links'::regclass)
          and row_security_active('app.family_entries'::regclass)
          and row_security_active('app.family_entry_links'::regclass)
          and has_function_privilege('app.family_ai_status(uuid, integer)', 'EXECUTE')
          and has_table_privilege('app.channel_change_counters', 'SELECT') and has_table_privilege('app.message_stars', 'SELECT') and has_table_privilege('app.chat_privacy', 'SELECT') and has_table_privilege('app.push_subscriptions', 'SELECT')
          and has_table_privilege('app.families', 'SELECT')
          and has_table_privilege('app.android_push_devices', 'SELECT')
          and has_any_column_privilege('app.outbox', 'INSERT') and not has_any_column_privilege('app.outbox', 'SELECT') as ready
      `);
      return result.rows[0]?.ready === true;
    } catch {
      return false;
    }
  }

  async withActor<T>(actorId: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new ServiceUnavailableException("The family workspace is temporarily unavailable.");
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query("begin");
      const { rows } = await client.query<{ restricted: boolean }>(`
        select current_user = 'famsync_api'
          and row_security_active('app.profiles'::regclass) as restricted
      `);
      if (rows[0]?.restricted !== true) {
        throw new ServiceUnavailableException("The family workspace is temporarily unavailable.");
      }
      await client.query("select set_config('app.actor_id', $1, true), set_config('app.request_id', $2, true)",
        [actorId, currentRequestId() ?? ""]);
      const result = await run(client);
      await client.query("commit");
      return result;
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
