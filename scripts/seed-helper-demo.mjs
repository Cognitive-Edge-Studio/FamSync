// Seeds the Family Helper ("Juniper") into the Carter demo family: the helper itself, its place in two chats, a shopping
// list with items from each person, and a few remembered facts. When the server has AI switched on, it also runs two real
// demo conversations in Household (a catch-up and an "ask everyone"), once only. It only adds: nothing is deleted, and
// running it again skips what is already there. Everything goes through the public API, as each demo person.
//
//   Local:    node scripts/seed-helper-demo.mjs
//   Staging:  node --env-file=.env.staging-demo.local scripts/seed-helper-demo.mjs --staging
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const hosted = process.argv.includes('--staging'), env = process.env;
const API = (hosted ? 'https://famsync-api-staging.onrender.com' : env.DEMO_API ?? 'http://127.0.0.1:4000') + '/api/v1';
const AUTH = hosted ? 'https://axzyacocepjelsgqnsky.supabase.co/auth/v1' : 'http://127.0.0.1:55431';
const DOMAIN = hosted ? 'staging.demo.famsync.test' : 'demo.famsync.test', PASSWORD = hosted ? env.DEMO_PASSWORD : 'FamSync-demo-2026!';
assert.ok(PASSWORD, 'DEMO_PASSWORD is missing.');
const emails = Object.fromEntries(['emily', 'michael', 'jake', 'lily', 'linda'].map((name) => [name, name + '@' + DOMAIN]));
if (hosted) emails.emily = 'emily@famsync.test';
// The sign-in server's public key, as in the website's own settings.
const web = hosted ? await readFile(new URL('../apps/web/.env.production.local', import.meta.url), 'utf8') : '';
const publicKey = /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/.exec(web)?.[1].trim();
const authHeaders = { 'Content-Type': 'application/json', ...(publicKey ? { apikey: publicKey } : {}) };

const tokens = {}, users = {};
async function signIn(who, password) {
  const response = await fetch(AUTH + '/token?grant_type=password', { method: 'POST', headers: authHeaders, body: JSON.stringify({ email: emails[who], password }) }), body = await response.json().catch(() => ({}));
  if (!body.access_token) throw new Error('Could not sign in ' + who + ' (' + response.status + ').');
  tokens[who] = body.access_token; users[who] = body.user.id;
}
async function must(who, method, path, body) {
  // A sleeping hosted API can take up to a minute to wake.
  const response = await fetch(API + path, { method, signal: AbortSignal.timeout(120_000), headers: { Authorization: 'Bearer ' + tokens[who], ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(method + ' ' + path.replace(/[0-9a-f-]{36}/g, '…') + ' as ' + who + ': ' + response.status + ' ' + (data?.message ?? ''));
  return data;
}
const step = (text) => console.log('✓ ' + text);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

for (const who of Object.keys(emails)) await signIn(who, hosted && who === 'emily' ? env.DEMO_OWNER_PASSWORD : PASSWORD);
const family = (await must('emily', 'GET', '/families')).find((item) => item.isDefault);
assert.ok(family && /Carter/.test(family.name), 'The Carter demo family was not found.');
if (hosted) assert.equal(family.id, env.DEMO_FAMILY_ID, 'This is not the seeded staging family.');
const F = '/families/' + family.id;

// The helper. An existing helper keeps the name and look the family gave it.
let status = await must('emily', 'GET', F + '/helper');
if (!status.helper) status = await must('emily', 'PUT', F + '/helper', { name: 'Juniper', emoji: '🌿' });
const name = status.helper.name;
step('Helper: ' + name + (status.available ? ' (AI available)' : ' (AI is off on this server: conversations are skipped)'));

// Its chats.
const chats = (await must('emily', 'GET', F + '/channels?kind=all&limit=100')).channels;
const chat = (title) => chats.find((item) => item.name === title);
// The demo conversations go in Household; `--chat "<name>"` picks another chat (used to rehearse them).
const chatArg = process.argv.indexOf('--chat'), talkIn = chatArg > 0 ? process.argv[chatArg + 1] : 'Household';
const house = chat(talkIn);
assert.ok(house, 'Chat "' + talkIn + '" was not found.');
for (const title of new Set(['Household', 'Holiday plans', talkIn])) {
  const found = chat(title);
  if (!found) continue;
  if (!found.helperEnabled) await must('emily', 'PUT', F + '/helper/channels/' + found.id, { enabled: true });
  step(name + ' is in ' + title);
}

// The shopping list: each person adds their own, so every item shows who it is for. Repeats are skipped by the server.
// Anything already on the list, bought or not, is left alone so a repeat run adds nothing.
const wants = { emily: ['Milk', 'Eggs', 'Paper towels'], michael: ['Coffee beans', 'Dish soap'], jake: ['Gatorade', 'Granola bars'], lily: ['Blue poster paint', 'Strawberries'], linda: ['Cranberries', 'Pie crust'] };
const listed = new Set((await must('emily', 'GET', F + '/helper/list')).map((item) => item.title.toLowerCase()));
for (const [who, items] of Object.entries(wants)) for (const title of items) if (!listed.has(title.toLowerCase())) await must(who, 'POST', F + '/helper/list', { title });
let list = await must('emily', 'GET', F + '/helper/list');
const bought = list.find((item) => item.title === 'Paper towels' && !item.done);
if (bought) list = await must('emily', 'PUT', F + '/helper/list/' + bought.id, { done: true });
step('Shopping list: ' + list.filter((item) => !item.done).length + ' to buy, ' + list.filter((item) => item.done).length + ' bought');

// What the helper remembers. Repeats are skipped by the server.
const facts = [
  ['Jake is allergic to peanuts', 'jake'], ['Lily is vegetarian', 'lily'], ['Michael does the Saturday Costco run', 'michael'],
  ['Grandma Linda hosts Sunday dinner', 'linda'], ['The family does the big grocery shop on Saturdays', null],
];
for (const [fact, about] of facts) await must('emily', 'POST', F + '/helper/memory', { fact, aboutUserId: about ? users[about] : null });
step('Memory: ' + (await must('emily', 'GET', F + '/helper/memory')).length + ' facts');

// Real demo conversations, only with AI on and only once: skipped when the helper has already spoken in Household.
const H = F + '/channels/' + house.id;
const recent = async () => (await must('emily', 'GET', H + '/messages?limit=50')).messages;
const say = (who, body) => must(who, 'POST', H + '/messages', { id: randomUUID(), body });
async function answerTo(id, seconds = 120) {
  for (let i = 0; i < seconds / 2; i += 1) { await wait(2000); const found = (await recent()).find((m) => m.fromHelper && m.replyTo?.id === id); if (found) return found; }
  throw new Error(name + ' did not answer within ' + seconds + ' seconds.');
}
if (!status.available) step('Conversations skipped: switch AI on (FAMILY_AI_ENABLED) and run this again to add them.');
else if ((await recent()).some((m) => m.fromHelper)) step('Conversations skipped: ' + name + ' has already spoken in ' + talkIn + '.');
else {
  const catchUp = await say('emily', '@' + name + ' catch me up on this chat in two lines');
  await answerTo(catchUp.id);
  step(talkIn + ': ' + 'catch-up answered');
  const ask = await say('emily', '@' + name + ' ask everyone what they need from the store this weekend, answers in 30 minutes');
  await answerTo(ask.id);
  await say('michael', 'Coffee beans please, we are almost out');
  await say('jake', 'gatorade for soccer on saturday!!');
  await say('lily', 'Blue poster paint for my science fair board, and strawberries');
  const wrap = await say('emily', '@' + name + ' thanks everyone, wrap it up');
  await answerTo(wrap.id);
  let summary;
  for (let i = 0; i < 60 && !summary; i += 1) { summary = (await recent()).find((m) => m.fromHelper && !m.replyTo && Date.parse(m.createdAt) > Date.parse(wrap.createdAt)); if (!summary) await wait(2000); }
  step(talkIn + ': ' + 'ask-everyone ' + (summary ? 'summary posted' : 'wrap-up sent (summary still pending)'));
}
console.log('Done. Sign in as ' + emails.emily + ' and open Family Helper, or Household.');
