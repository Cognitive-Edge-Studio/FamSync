import assert from 'node:assert/strict';
import test from 'node:test';
import { keepTurns, minutesLeft, speechGate, voiceLimits, voiceStep } from '@famsync/core/voice';

function run(levels: [number, number][]) {
  const gate = speechGate(), seen: string[] = [];
  let at = 0;
  for (const [db, ms] of levels) for (const end = at + ms; at < end; at += 100) seen.push(gate.hear(db, at));
  return seen;
}
test('speech starts, survives a short pause, and ends after a long one', () => {
  const seen = run([[-60, 1500], [-20, 1200], [-60, 800], [-22, 900], [-60, 1500]]);
  assert.ok(seen.includes('speaking'));
  assert.equal(seen.indexOf('done') * 100 >= 1500 + 1200 + 800 + 900, true);
});
test('a click is not speech, and silence gives up', () => {
  const seen = run([[-60, 1000], [-15, 100], [-60, voiceLimits.waitSeconds * 1000]]);
  assert.ok(!seen.includes('speaking'));
  assert.equal(seen.at(-1), 'silent');
});
test('a steadily noisy room still ends a turn', () => {
  assert.ok(run([[-42, 4000], [-18, 1500], [-42, 2000]]).includes('done'));
});
test('a turn never runs past its limit', () => {
  assert.ok(run([[-20, voiceLimits.recordSeconds * 1000 + 500]]).includes('done'));
});
test('missing loudness is treated as quiet', () => { assert.equal(speechGate().hear(Number.NaN, 0), 'waiting'); });
test('voice needs the server, the owner, the adult and time, in that order', () => {
  const status = { available: true, enabled: true, canManage: false, consented: true, remainingSeconds: 60 };
  assert.equal(voiceStep(status), 'ready');
  assert.equal(voiceStep({ ...status, remainingSeconds: 0 }), 'used');
  assert.equal(voiceStep({ ...status, consented: false, remainingSeconds: 0 }), 'consent');
  assert.equal(voiceStep({ ...status, enabled: false }), 'off');
  assert.equal(voiceStep({ ...status, available: false }), 'unavailable');
  assert.equal(minutesLeft(59), 'less than a minute left today');
  assert.equal(minutesLeft(119), '1 minute left today');
});
test('only the last turns are kept', () => {
  let turns: { you: string; reply: string }[] = [];
  for (let n = 0; n < 9; n += 1) turns = keepTurns(turns, { you: 'q' + n, reply: 'x'.repeat(2000) });
  assert.equal(turns.length, voiceLimits.turns);
  assert.equal(turns[0].you, 'q3');
  assert.equal(turns[0].reply.length, 1200);
});
