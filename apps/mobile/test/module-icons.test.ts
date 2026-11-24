import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { moduleIconFor, moduleIconNames } from '../src/lib/module-icons.ts';

test('mobile bundles the exact web 3D artwork at both densities', () => {
  for (const name of moduleIconNames) for (const density of ['', '@2x']) {
    const file = name + density + '.webp';
    assert.deepEqual(readFileSync(new URL('../assets/icons/3d/' + file, import.meta.url)), readFileSync(new URL('../../web/public/icons/3d/' + file, import.meta.url)));
  }
});

test('module glyphs resolve to web artwork while state and navigation controls retain their symbols', () => {
  assert.equal(moduleIconFor('git-network-outline'), 'home'); assert.equal(moduleIconFor('chatbubbles-outline'), 'messages');
  for (const control of ['chevron-forward', 'add', 'close', 'checkbox', 'radio-button-on', 'radio-button-off', 'checkmark-circle', 'sunny-outline', 'moon-outline']) assert.equal(moduleIconFor(control), undefined);
});
