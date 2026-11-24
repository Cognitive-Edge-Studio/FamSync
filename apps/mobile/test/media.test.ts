import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentProblem } from '../src/lib/attachment-rules.ts';
import { maxMediaBytes, maxVoiceSeconds, mediaFocus, mediaTime, recordingProblem, seekPosition } from '../src/lib/media-rules.ts';

test('voice recordings enforce the real byte and duration limits before sending', () => {
  assert.equal(maxVoiceSeconds, 600);
  assert.equal(recordingProblem(500, 1), null);
  assert.equal(recordingProblem(600000, maxMediaBytes), null);
  for (const [duration, bytes] of [[499, 100], [1000, 0], [1000, maxMediaBytes + 1], [602000, 10], [NaN, 100], [1000, Infinity]]) assert.ok(recordingProblem(duration, bytes));
});

test('seeking and duration labels handle ends and unknown metadata safely', () => {
  assert.equal(seekPosition(-15, 60), 0); assert.equal(seekPosition(75, 60), 60);
  assert.equal(seekPosition(17, 60), 17); assert.equal(seekPosition(Infinity, 60), 0);
  assert.equal(seekPosition(17, NaN), 0); assert.equal(seekPosition(17, -1), 0);
  assert.equal(mediaTime(0), '0:00'); assert.equal(mediaTime(61.9), '1:01');
  assert.equal(mediaTime(600), '10:00'); assert.equal(mediaTime(NaN), '0:00'); assert.equal(mediaTime(-1), '0:00');
});

test('a second media owner stops the first, and releasing an old owner cannot stop the new one', async () => {
  const focus = mediaFocus(), stopped: string[] = [];
  const first = await focus.claim(() => { stopped.push('audio'); });
  const second = await focus.claim(() => { stopped.push('video'); });
  assert.equal(first.current(), false); assert.equal(second.current(), true);
  first.release(); assert.equal(second.current(), true);
  await focus.stop(); assert.equal(second.current(), false);
  assert.deepEqual(stopped, ['audio', 'video']);
});

test('a slow authorization cannot start playback after navigation or sign-out', async () => {
  const focus = mediaFocus(); let started = false;
  const owner = await focus.claim(() => {});
  let finish!: () => void;
  const authorized = new Promise<void>((resolve) => { finish = resolve; }).then(() => { if (owner.current()) started = true; });
  await focus.stop(); finish(); await authorized;
  assert.equal(started, false);
});

test('overlapping media claims never give a stale recording ownership', async () => {
  const focus = mediaFocus(); let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await focus.claim(() => wait);
  const slow = focus.claim(() => {}), newer = await focus.claim(() => {});
  release(); const old = await slow;
  assert.equal(old.current(), false); assert.equal(newer.current(), true);
  await focus.stop();
});

test('a native-player cleanup error does not block recording or sign-out', async () => {
  const focus = mediaFocus();
  await focus.claim(() => { throw new Error('released'); });
  const next = await focus.claim(() => { throw new Error('released'); });
  assert.equal(next.current(), true); await focus.stop(); assert.equal(next.current(), false);
});

test('short video, native AAC, and web voice files use the existing media limits', () => {
  for (const name of ['Voice message.m4a', 'Voice message.weba', 'Clip.mp4', 'Clip.webm']) assert.equal(attachmentProblem({ name, size: maxMediaBytes }), null);
  assert.ok(attachmentProblem({ name: 'Clip.mp4', size: maxMediaBytes + 1 }));
  assert.ok(attachmentProblem({ name: 'Clip.mov', size: 10 }));
  assert.ok(attachmentProblem({ name: 'Voice message.m4a', size: 0 }));
});
