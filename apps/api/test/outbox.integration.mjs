// Runs against the local Compose database with the jobs login. Start it with `npm run db:start`.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { claimOutbox, completeOutbox, failOutbox, maxAttempts } from "../dist/outbox.store.js";

const jobsUrl = process.env.JOBS_DATABASE_URL ?? "postgresql://famsync_jobs:famsync-local-jobs@127.0.0.1:55432/postgres";
const adminUrl = process.env.ADMIN_DATABASE_URL ?? "postgresql://supabase_admin:famsync-local-admin@127.0.0.1:55432/postgres";
const prefix = "integration-" + Date.now() + "-";
const admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
const workers = [new pg.Pool({ connectionString: jobsUrl, max: 2 }), new pg.Pool({ connectionString: jobsUrl, max: 2 })];

async function insert(count, kind, attempts = 0) {
  const keys = Array.from({ length: count }, (_, index) => prefix + kind + "-" + index);
  await admin.query(`
    insert into app.outbox (kind, payload, dedupe_key, attempts)
    select $1, '{}', key, $3 from unnest($2::text[]) as key
  `, [kind, keys, attempts]);
  return keys;
}

// Each worker claims small batches and completes them, like the dispatcher does.
async function drain(pool, kind, seen) {
  for (;;) {
    const client = await pool.connect();
    try {
      const rows = await claimOutbox(client, [kind], 3);
      if (!rows.length) return;
      for (const row of rows) {
        seen.push(row.id);
        await completeOutbox(client, row.id);
      }
    } finally {
      client.release();
    }
  }
}

after(async () => {
  await admin.query("delete from app.outbox where dedupe_key like $1", [prefix + "%"]);
  await Promise.all([admin.end(), ...workers.map((pool) => pool.end())]);
});

test('provider retry-after prevents an early retry', async () => {
  const [key] = await insert(1, 'test.retry');
  const client = await workers[0].connect();
  try {
    const [row] = await claimOutbox(client, ['test.retry'], 1);
    await failOutbox(client, row.id, 'Android push delivery failed', 180);
    assert.equal((await claimOutbox(client, ['test.retry'], 1)).length, 0);
    const { rows: [result] } = await admin.query('select available_at > now() + interval \'170 seconds\' as delayed from app.outbox where dedupe_key=$1', [key]);
    assert.equal(result.delayed, true);
  } finally { client.release(); await admin.query('delete from app.outbox where dedupe_key=$1', [key]); }
});

test("two dispatchers running at once process each row exactly once", async () => {
  const keys = await insert(40, "test.noop");
  const seen = [];
  await Promise.all(workers.map((pool) => drain(pool, "test.noop", seen)));
  assert.equal(seen.length, keys.length);
  assert.equal(new Set(seen).size, keys.length);
  const { rows: [counts] } = await admin.query(
    "select count(*) filter (where status = 'done')::int as done, max(attempts)::int as attempts from app.outbox where dedupe_key = any($1)",
    [keys],
  );
  assert.deepEqual(counts, { done: keys.length, attempts: 1 });
});

test("a failure backs off and the final attempt marks the row dead with its error", async () => {
  const [retryKey] = await insert(1, "test.retry");
  const [deadKey] = await insert(1, "test.dead", maxAttempts - 1);
  const client = await workers[0].connect();
  try {
    const rows = await claimOutbox(client, ["test.retry", "test.dead"], 10);
    assert.equal(rows.length, 2);
    for (const row of rows) await failOutbox(client, row.id, "Simulated failure for " + row.kind);
  } finally {
    client.release();
  }
  const { rows } = await admin.query(`
    select kind, status, attempts, last_error, available_at > now() + interval '10 seconds' as backed_off
    from app.outbox where dedupe_key = any($1) order by kind
  `, [[retryKey, deadKey]]);
  assert.deepEqual(rows.map(({ kind, status, attempts }) => ({ kind, status, attempts })), [
    { kind: "test.dead", status: "dead", attempts: maxAttempts },
    { kind: "test.retry", status: "pending", attempts: 1 },
  ]);
  assert.equal(rows[1].backed_off, true);
  assert.match(rows[0].last_error, /Simulated failure/);
});

test("a row whose worker stopped mid-run becomes claimable after its lock expires", async () => {
  const [key] = await insert(1, "test.stuck");
  await admin.query(
    "update app.outbox set status = 'processing', attempts = 1, locked_until = now() - interval '1 second' where dedupe_key = $1",
    [key],
  );
  const client = await workers[1].connect();
  try {
    const rows = await claimOutbox(client, ["test.stuck"], 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].attempts, 2);
    await completeOutbox(client, rows[0].id);
  } finally {
    client.release();
  }
});
