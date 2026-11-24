import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PushService } from '../dist/push.service.js';
import { validateStoredFile } from '../dist/file-validation.js';

const file = (buffer, name) => ({ buffer, size: buffer.length, originalname: name });
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40)]);
const webm = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(10), Buffer.from('webm'), Buffer.alloc(40)]);

test('recordings and video are accepted only when the content matches the name', async () => {
  assert.equal((await validateStoredFile(file(mp4, 'a.m4a'))).mime, 'audio/mp4');
  assert.equal((await validateStoredFile(file(mp4, 'a.mp4'))).mime, 'video/mp4');
  assert.equal((await validateStoredFile(file(webm, 'a.weba'))).mime, 'audio/webm');
  assert.equal((await validateStoredFile(file(webm, 'a.webm'))).mime, 'video/webm');
  for (const [content, name] of [[webm, 'a.mp4'], [mp4, 'a.webm'], [Buffer.from('<html></html>'), 'a.mp4'], [Buffer.from('1a45dfa3', 'hex'), 'a.weba'], [mp4, 'a.mov']])
    await assert.rejects(validateStoredFile(file(content, name)));
  await assert.rejects(validateStoredFile(file(mp4, 'a.mp4'), true));
  await assert.rejects(validateStoredFile(file(Buffer.alloc(5 * 1024 * 1024 + 1), 'a.mp4')));
});

test('push goes only to browser push services', () => {
  const push = new PushService({});
  for (const url of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://db5p.notify.windows.com/w/?token=x', 'https://web.push.apple.com/x'])
    assert.equal(push.allowedEndpoint(url), true, url);
  for (const url of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://fcm.googleapis.com.evil.test/x',
    'https://evil.test/fcm.googleapis.com', 'https://user:pw@fcm.googleapis.com/x', 'https://notify.windows.com.evil.test/x', 'https://a.b.notify.windows.com/x', 'javascript:alert(1)', 'not a url'])
    assert.equal(push.allowedEndpoint(url), false, url);
});
