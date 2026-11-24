import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AndroidPushService } from '../dist/android-push.service.js';
import { pushRetrySeconds } from '../dist/push-retry.js';

function fixture(t, options = {}) {
  const config = { FCM_PROJECT_ID: 'famsync-test', FCM_CLIENT_EMAIL: 'test@famsync-test.iam.gserviceaccount.com', FCM_PRIVATE_KEY: 'test-key' };
  const previous = Object.fromEntries(Object.keys(config).map((key) => [key, process.env[key]]));
  Object.assign(process.env, config);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const sent = [], retired = [], calls = [];
  const row = { id: 'notice', familyId: 'family', kind: 'message', sourceKind: 'conversation', sourceId: 'chat', occurrenceKey: 'message', title: 'PRIVATE TITLE', timeZone: 'UTC', readAt: null, createdAt: new Date(), ...options.notice };
  const device = { id: 'device', familyId: 'family', token: 'SECRET_DEVICE_TOKEN' };
  const client = { query: async (sql, args) => {
    calls.push(sql);
    if (sql.includes('from app.android_push_devices')) return { rows: options.noDevice ? [] : [device] };
    if (sql.includes('visible')) return { rows: options.noNotice ? [] : [row] };
    if (sql.includes('select muted')) return { rows: options.noParticipant ? [] : [{ muted: !!options.muted }] };
    if (sql.includes('quiet_enabled')) return { rows: [{ enabled: !!options.quiet, start: new Date(Date.now()-3600000).toISOString().slice(11,16), end: new Date(Date.now()+3600000).toISOString().slice(11,16) }] };
    if (sql.includes('remove_android_push')) { retired.push(args); return { rows: [] }; }
    throw new Error('Unexpected query: ' + sql);
  } };
  const service = new AndroidPushService({ withActor: async (user, run) => { assert.equal(user, 'user'); return run(client); } });
  service.auth.getAccessToken = async () => ({ token: 'ACCESS_TOKEN' });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://fcm.googleapis.com/v1/projects/famsync-test/messages:send');
    assert.equal(init.headers.Authorization, 'Bearer ACCESS_TOKEN');
    sent.push(JSON.parse(init.body));
    if (options.throw) throw new Error('SECRET_TOKEN provider error');
    return new Response(JSON.stringify(options.error ? { error: { details: [{ '@type': options.errorType ?? 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: options.error }] } } : {}), { status: options.status ?? 200, headers: options.retryAfter ? { 'Retry-After': options.retryAfter } : {} });
  });
  return { service, sent, retired, calls, send: () => service.deliver('user', 'notice', 'device') };
}

test('native push contains generic lock-screen text, identifiers and Android channels', async (t) => {
  const f = fixture(t);
  await f.send();
  const { message } = f.sent[0];
  assert.deepEqual(message.notification, { title: 'FamSync', body: 'New message' });
  assert.deepEqual(message.data, { notificationId: 'notice', familyId: 'family', recipientId: 'user' });
  assert.equal(message.android.notification.channel_id, 'famsync-updates');
  assert.equal(message.android.notification.tag, 'chat:chat');
  assert.equal(message.android.notification.visibility, 'PRIVATE');
  assert.equal(JSON.stringify(f.sent).includes('PRIVATE TITLE'), false);
});

for (const [label, options] of [
  ['revoked/signed-out device', { noDevice: true }], ['lost access or deleted message', { noNotice: true }],
  ['read', { notice: { readAt: new Date() } }], ['old', { notice: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } }],
  ['muted', { muted: true }], ['removed participant', { noParticipant: true }], ['another family or guest channel', { notice: { familyId: 'other' } }],
]) test(label + ' sends nothing', async (t) => { const f = fixture(t, options); await f.send(); assert.equal(f.sent.length, 0); });

test('quiet hours select the silent Android channel', async (t) => {
  const f = fixture(t, { quiet: true }); await f.send();
  assert.equal(f.sent[0].message.android.notification.channel_id, 'famsync-quiet');
  assert.equal(f.sent[0].message.android.notification.default_sound, undefined);
});

for (const kind of ['reminder', 'assigned', 'unassigned', 'moved', 'cancelled', 'mention']) test(kind + ' has generic text', async (t) => {
  const f = fixture(t, { notice: { kind, sourceKind: kind === 'mention' ? 'conversation' : 'task' } });
  await f.send(); assert.equal(f.sent.length, 1); assert.equal(JSON.stringify(f.sent).includes('PRIVATE TITLE'), false);
});

for (const error of ['UNREGISTERED', 'SENDER_ID_MISMATCH', 'INVALID_ARGUMENT']) test(error + ' retires only the token that was sent', async (t) => {
  const f = fixture(t, { status: 404, error }); await f.send(); assert.deepEqual(f.retired, [['device', 'SECRET_DEVICE_TOKEN']]);
});
for (const status of [400, 401, 403, 429, 500, 503]) test('FCM ' + status + ' remains retryable without exposing credentials', async (t) => {
  const f = fixture(t, { status, error: 'UNSPECIFIED_ERROR' });
  await assert.rejects(f.send(), { message: 'Android push delivery failed' }); assert.equal(f.retired.length, 0);
});
test('an invalid payload never retires a valid device token', async (t) => {
  const f = fixture(t, { status: 400, error: 'INVALID_ARGUMENT', errorType: 'type.googleapis.com/google.rpc.BadRequest' });
  await assert.rejects(f.send()); assert.equal(f.retired.length, 0);
});
test('FCM retry-after is honored, with at least a minute of backoff', async (t) => {
  const f = fixture(t, { status: 429, retryAfter: '180' });
  await assert.rejects(f.send(), (error) => error.retrySeconds === 180);
  for (const value of [null, '0', '-1', 'bad']) assert.equal(pushRetrySeconds(value), 60);
  assert.equal(pushRetrySeconds(new Date(180000).toUTCString(), 0), 180);
});
test('transport errors are redacted', async (t) => { const f = fixture(t, { throw: true }); await assert.rejects(f.send(), { message: 'Android push delivery failed' }); });
test('unconfigured Android delivery makes no requests', async (t) => {
  const f = fixture(t); f.service.project = ''; await f.send(); assert.equal(f.sent.length, 0); assert.equal(f.calls.length, 0);
});
