import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function worker(windows = []) {
  const handlers = {}, shown = [], opened = [];
  const self = {
    location: { origin: 'https://famsync.test' }, skipWaiting() {}, addEventListener: (name, run) => { handlers[name] = run; },
    clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (path) => { opened.push(path); } },
    registration: { showNotification: async (title, options) => { shown.push({ title, ...options }); } },
  };
  vm.runInNewContext(readFileSync(new URL('../../web/public/push-worker.js', import.meta.url), 'utf8'), { self, URL });
  const run = async (name, event) => { let work; handlers[name]({ ...event, waitUntil: (promise) => { work = promise; } }); await work; };
  return { shown, opened, push: (data) => run('push', { data: data && { json: () => data } }), click: (path) => run('notificationclick', { notification: { close() {}, data: { path } } }) };
}

test('push shows one notice per conversation and stays quiet in quiet hours', async () => {
  const w = worker();
  await w.push({ title: 'FamSync', body: 'New message', path: '/message/?id=1', tag: 'chat:1', silent: true });
  assert.equal(w.shown[0].tag, 'chat:1');
  assert.equal(w.shown[0].silent, true);
  assert.equal(w.shown[0].renotify, false);
  assert.equal(w.shown[0].data.path, '/message/?id=1');
  await w.push(undefined);
  assert.equal(w.shown.length, 2);
});

test('nothing is shown while FamSync is focused on screen', async () => {
  const w = worker([{ visibilityState: 'visible', focused: true }]);
  await w.push({ body: 'New message' });
  assert.equal(w.shown.length, 0);
});

test('clicks open only FamSync paths, in an open window when there is one', async () => {
  const w = worker();
  for (const path of ['https://evil.test/x', '//evil.test/x', 'javascript:alert(1)', undefined]) await w.click(path);
  assert.deepEqual(w.opened, Array(4).fill('/notifications/'));
  await w.click('/task/?id=2');
  assert.equal(w.opened.at(-1), '/task/?id=2');
  const moved = [], open = worker([{ focus: async () => {}, navigate: async (path) => { moved.push(path); } }]);
  await open.click('/task/?id=3');
  assert.deepEqual([moved, open.opened], [['/task/?id=3'], []]);
});
