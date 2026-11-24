import assert from 'node:assert/strict';
import test from 'node:test';
import { pushLink, registrationLane } from '../src/lib/push-rules.ts';

const id = 'a0000000-0000-4000-8000-000000000001';
test('push links accept identifiers only, with no payload URL or content', () => {
  const input = { notificationId: id, familyId: id, recipientId: id };
  assert.deepEqual(pushLink({ ...input, url: 'https://evil.test', body: 'secret' }), input);
  for (const bad of [null, {}, 'text', { ...input, notificationId: [id] }, { ...input, recipientId: undefined }, { ...input, familyId: 'javascript:alert(1)' }]) assert.equal(pushLink(bad), null);
});

test('sign-out cancels an in-flight registration before removing it', async () => {
  const lane = registrationLane(), steps: string[] = [];
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const register = lane.run(async (current) => { steps.push('get token'); await wait; if (current()) steps.push('register'); });
  await Promise.resolve();
  lane.cancel();
  const remove = lane.run(async () => { steps.push('remove'); });
  release(); await Promise.all([register, remove]);
  assert.deepEqual(steps, ['get token', 'remove']);
});

test('queued stale work is cancelled, rotation is serialized and failures do not block removal', async () => {
  const lane = registrationLane(), steps: string[] = [];
  const stale = lane.run(async (current) => { if (current()) steps.push('old account'); });
  lane.cancel();
  const rotate = lane.run(async () => { steps.push('rotate'); throw new Error('offline'); });
  const remove = lane.run(async () => { steps.push('remove'); });
  await stale; await assert.rejects(rotate); await remove;
  assert.deepEqual(steps, ['rotate', 'remove']);
});
