import assert from 'node:assert/strict';
import test from 'node:test';
import { versionCheck } from '../src/lib/version-check.ts';
import { androidBuild, offlineVersionWindow, readSavedVersionPolicy, readVersionPolicy, type VersionState } from '../src/lib/version-policy.ts';

const server = 'https://api.famsync.test', policy = (minimumBuild = 1) => ({ minimumBuild, updateUrl: 'https://famsync.test/android' });
const stamp = 1_000_000_000;
const saved = (minimumBuild = 1, checkedAt = stamp, origin = server) => JSON.stringify({ server: origin, policy: policy(minimumBuild), checkedAt });
function fixture(raw: string | null = null, build = 2) {
  let time = stamp, stored = raw, answer: unknown = policy(), failed = false, writesFail = false;
  const states: VersionState[] = [];
  const check = versionCheck({ build, server, now: () => time, read: async () => stored,
    remove: async () => { stored = null; },
    write: async (value) => { if (writesFail) throw new Error('Disk full'); stored = value; },
    fetch: async () => { if (failed) throw new Error('Offline'); return answer; }, changed: (state) => states.push(state),
  });
  return { check, states, last: () => states.at(-1)!, stored: () => stored,
    at: (now: number) => { time = now; }, response: (value: unknown) => { answer = value; failed = false; }, offline: () => { failed = true; }, diskFull: () => { writesFail = true; } };
}

test('Android uses integer binary version codes, including numeric order beyond 9', () => {
  assert.equal(androidBuild('10'), 10); assert.equal(androidBuild('2100000000'), 2100000000);
  for (const value of [null, undefined, 1, '', '0', '-1', '1.2.3', '01', '1e3', ' 1', '2100000001']) assert.equal(androidBuild(value), null);
});

test('malformed policies and unsafe update links cannot pass validation', () => {
  for (const value of [null, {}, { minimumBuild: '2', updateUrl: null }, { minimumBuild: 1.5, updateUrl: null }, { minimumBuild: 0, updateUrl: null }, { minimumBuild: 2100000001, updateUrl: null },
    { minimumBuild: 1 }, ...['http://x.test', 'javascript:alert(1)', 'file:///update.apk', 'https://user:secret@x.test', 'bad'].map((updateUrl) => ({ minimumBuild: 1, updateUrl }))]) assert.throws(() => readVersionPolicy(value));
  assert.deepEqual(readVersionPolicy({ minimumBuild: 2, updateUrl: null }), { minimumBuild: 2, updateUrl: null });
});

test('cache is bound to the server and rejects corrupt or future-dated decisions', () => {
  for (const raw of ['bad', 'null', '{}', saved(1, stamp, 'https://other.test'), saved(1, stamp + 1), saved(1, -1)]) assert.equal(readSavedVersionPolicy(raw, server, stamp), undefined);
  assert.equal(readSavedVersionPolicy(saved(), server, stamp)?.policy.minimumBuild, 1);
});

test('first launch needs a valid live policy; equality and higher installed builds pass', async () => {
  const first = fixture(); first.offline(); await first.check.refresh(); assert.equal(first.last().status, 'unavailable');
  for (const minimum of [1, 2]) { first.response(policy(minimum)); await first.check.refresh(); assert.equal(first.last().status, 'allowed'); assert.equal(first.last().cached, false); }
  assert.equal(JSON.parse(first.stored()!).policy.minimumBuild, 2);
});

test('a recent accepted build can read offline, but the permission expires at 24 hours', async () => {
  const f = fixture(saved()); f.offline(); await f.check.refresh(); assert.equal(f.last().status, 'allowed'); assert.equal(f.last().cached, true);
  f.at(stamp + offlineVersionWindow - 1); await f.check.refresh(); assert.equal(f.last().status, 'allowed');
  f.at(stamp + offlineVersionWindow); await f.check.refresh(); assert.equal(f.last().status, 'unavailable');
});

test('an old cached rejection remains blocked offline and after expiry or app restart', async () => {
  const f = fixture(saved(3)); f.offline(); f.at(stamp + offlineVersionWindow * 7); await f.check.refresh();
  assert.equal(f.last().status, 'blocked');
  const restarted = fixture(f.stored()); restarted.offline(); await restarted.check.refresh(); assert.equal(restarted.last().status, 'blocked');
});

test('a raised minimum blocks an open app and a live rollback or newer binary can reopen it', async () => {
  const f = fixture(saved()); f.response(policy(10)); await f.check.refresh(); assert.equal(f.last().status, 'blocked');
  f.offline(); await f.check.refresh(); assert.equal(f.last().status, 'blocked');
  const upgraded = fixture(f.stored(), 10); upgraded.offline(); await upgraded.check.refresh(); assert.equal(upgraded.last().status, 'allowed');
  f.response(policy(2)); await f.check.refresh(); assert.equal(f.last().status, 'allowed');
});

test('an invalid or failed server response cannot remove a known block', async () => {
  const f = fixture(saved(10)); f.response({ minimumBuild: 0, updateUrl: null }); await f.check.refresh();
  assert.equal(f.last().status, 'blocked'); assert.equal(JSON.parse(f.stored()!).policy.minimumBuild, 10);
  const first = fixture(); first.response({}); await first.check.refresh(); assert.equal(first.last().status, 'unavailable');
});

test('storage failure does not discard a valid response or bypass its rejection on retry', async () => {
  const f = fixture(saved()); f.diskFull(); f.response(policy(10)); await f.check.refresh(); assert.equal(f.last().status, 'blocked');
  f.offline(); await f.check.refresh(); assert.equal(f.last().status, 'blocked');
  assert.equal(f.stored(), null);
  const restarted = fixture(f.stored()); restarted.offline(); await restarted.check.refresh(); assert.equal(restarted.last().status, 'unavailable');
});

test('a slow superseded request and a stopped checker cannot overwrite a newer policy', async () => {
  const resolvers: ((value: unknown) => void)[] = [], states: VersionState[] = [];
  const check = versionCheck({ build: 1, server, read: async () => null, write: async () => {}, remove: async () => {}, changed: (state) => states.push(state),
    fetch: () => new Promise((resolve) => resolvers.push(resolve)), now: () => stamp });
  const first = check.refresh(); await Promise.resolve(); await Promise.resolve();
  const second = check.refresh(); resolvers[1](policy(10)); await second;
  resolvers[0](policy()); await first; assert.equal(states.at(-1)?.status, 'blocked');
  const pending = check.refresh(), count = states.length; check.stop(); resolvers[2](policy()); await pending; assert.equal(states.length, count);
});

test('policy persistence stays in decision order when storage is slow', async () => {
  let answer = policy(), stored = '', finishFirst: () => void = () => {};
  const check = versionCheck({ build: 1, server, now: () => stamp, changed: () => {}, read: async () => null,
    remove: async () => {},
    fetch: async () => answer,
    write: async (raw) => { if (!stored) { stored = 'writing'; await new Promise<void>((resolve) => { finishFirst = resolve; }); } stored = raw; },
  });
  const first = check.refresh();
  while (stored !== 'writing') await Promise.resolve();
  answer = policy(10); const second = check.refresh(); await Promise.resolve();
  finishFirst(); await Promise.all([first, second]); assert.equal(JSON.parse(stored).policy.minimumBuild, 10);
});
