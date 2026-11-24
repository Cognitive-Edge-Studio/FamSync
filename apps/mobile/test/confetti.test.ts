import assert from 'node:assert/strict';
import test from 'node:test';
import { confettiPieces } from '../src/lib/confetti.ts';

test('confetti stays on screen and ends within its time', () => {
  for (const seed of [1, 2, 99]) for (const piece of confettiPieces(34, seed)) {
    assert.ok(piece.x >= 0 && piece.x < 1 && Math.abs(piece.drift) <= 0.2 && piece.rise > 0 && piece.rise < 1);
    assert.ok(piece.delay + piece.time <= 2600);
  }
  assert.deepEqual(confettiPieces(5, 7), confettiPieces(5, 7));
});
