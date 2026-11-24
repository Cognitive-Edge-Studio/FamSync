import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { askNotice, askStep, requestLimit } from '../src/lib/family-ask.ts';

test('questions need the server, the owner and the person, in that order', () => {
  const status = { available: true, enabled: true, canManage: false, consented: true, remaining: 5 };
  assert.equal(askStep(status), 'ready');
  assert.equal(askStep({ ...status, consented: false }), 'consent');
  assert.equal(askStep({ ...status, enabled: false }), 'off');
  assert.equal(askStep({ ...status, available: false }), 'unavailable');
});
test('the notice is the one accepted on web', () => {
  const web = readFileSync(new URL('../../web/src/components/family-ask-dialog.tsx', import.meta.url), 'utf8');
  for (const line of askNotice) assert.ok(web.includes('<li>' + line + '</li>'), line);
});
test('a question is given the time the AI service may take', () => {
  assert.ok(requestLimit('https://x.test/api/v1/families/f/base/ai/questions') > 45_000);
  assert.equal(requestLimit('https://x.test/api/v1/families'), 30_000);
});
