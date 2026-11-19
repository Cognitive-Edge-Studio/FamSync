import type { PoolClient } from "pg";

export type OutboxRow = {
  id: string;
  kind: string;
  familyId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  requestId: string | null;
};

export const maxAttempts = 8;
// A claimed row stays locked this long. A crashed worker's rows become claimable again afterwards.
const lockSeconds = 120;

// Claims due work of the given kinds. SKIP LOCKED lets several dispatchers run at once without sharing a row.
export async function claimOutbox(client: PoolClient, kinds: string[], limit: number) {
  const { rows } = await client.query<OutboxRow>(`
    update app.outbox o set status = 'processing', attempts = o.attempts + 1,
      locked_until = now() + make_interval(secs => $2)
    where o.id in (
      select id from app.outbox
      where kind = any($3::text[])
        and ((status = 'pending' and available_at <= now()) or (status = 'processing' and locked_until < now()))
      order by available_at
      limit $1
      for update skip locked
    )
    returning o.id, o.kind, o.family_id as "familyId", o.payload, o.attempts, o.request_id as "requestId"
  `, [limit, lockSeconds, kinds]);
  return rows;
}

export async function completeOutbox(client: PoolClient, id: string) {
  await client.query(`
    update app.outbox set status = 'done', locked_until = null, last_error = null, finished_at = now()
    where id = $1 and status = 'processing'
  `, [id]);
}

// Retries back off from 15 seconds, doubling up to an hour. The last allowed attempt marks the row dead.
export async function failOutbox(client: PoolClient, id: string, error: string) {
  const { rows: [row] } = await client.query<{ status: string }>(`
    update app.outbox set
      status = case when attempts >= $3 then 'dead' else 'pending' end,
      available_at = now() + least(interval '1 hour', interval '15 seconds' * power(2, greatest(attempts - 1, 0))),
      locked_until = null, last_error = left($2, 500),
      finished_at = case when attempts >= $3 then now() end
    where id = $1 and status = 'processing'
    returning status
  `, [id, error, maxAttempts]);
  return row?.status;
}
