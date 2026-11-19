import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";

// Connects as the jobs login, which can manage the outbox but cannot read family items.
@Injectable()
export class JobsDatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(JobsDatabaseService.name);
  private readonly pool: Pool | undefined;

  constructor() {
    const connectionString = process.env.JOBS_DATABASE_URL;
    if (!connectionString) return;
    this.pool = new Pool({ connectionString, connectionTimeoutMillis: 1500, query_timeout: 10_000, max: 3 });
    this.pool.on("error", () => this.logger.warn("An idle jobs database connection closed unexpectedly."));
  }

  get configured() {
    return this.pool !== undefined;
  }

  async withClient<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error("JOBS_DATABASE_URL is not configured.");
    const client = await this.pool.connect();
    try {
      const { rows: [role] } = await client.query<{ jobs: boolean }>("select current_user = 'famsync_jobs' as jobs");
      if (!role?.jobs) throw new Error("The jobs connection must use the famsync_jobs login.");
      return await run(client);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
