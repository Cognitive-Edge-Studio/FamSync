// Adds to the demo family what seed-demo.mjs does not cover: memories, places, ideas, reactions, pins, stars, photos,
// voice, video, linked work, forwarded and edited messages, a guest, and a fresh week of plans. It only adds. Nothing is
// deleted or replaced, and running it again skips what is already there. A run in a later week adds that week's plans.
//
//   Local:    DEMO_API=http://127.0.0.1:4000 node --env-file=apps/api/.env.example scripts/seed-demo-extras.mjs
//   Staging:  node --env-file=.env.staging-demo.local scripts/seed-demo-extras.mjs --staging
// The staging guest also needs the API's own settings (see docs/demo-accounts.md). Without them the guest is skipped.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const hosted = process.argv.includes('--staging'), env = process.env, ZONE = 'America/Chicago';
const API = (hosted ? 'https://famsync-api-staging.onrender.com' : env.DEMO_API ?? 'http://127.0.0.1:4000') + '/api/v1';
const AUTH = hosted ? 'https://axzyacocepjelsgqnsky.supabase.co/auth/v1' : 'http://127.0.0.1:55431';
const DOMAIN = hosted ? 'staging.demo.famsync.test' : 'demo.famsync.test', PASSWORD = hosted ? env.DEMO_PASSWORD : 'FamSync-demo-2026!';
assert.ok(PASSWORD, 'DEMO_PASSWORD is missing.');
const emails = Object.fromEntries(['emily', 'michael', 'jake', 'lily', 'linda', 'nora'].map((name) => [name, name + '@' + DOMAIN]));
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
async function call(who, method, path, body) {
  const form = body instanceof FormData;
  const response = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + tokens[who], ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}) }, body: form ? body : body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => null) };
}
async function must(who, method, path, body) {
  const { status, data } = await call(who, method, path, body);
  if (status < 200 || status > 299) throw new Error(method + ' ' + path.replace(/[0-9a-f-]{36}/g, '…') + ' as ' + who + ': ' + status + ' ' + (data?.message ?? ''));
  return data;
}
let added = 0, skipped = 0;
// The same item always has the same ID, so it can exist only once.
async function create(who, path, body) {
  const { status, data } = await call(who, 'POST', path, body);
  if (status === 200 || status === 201) { added += 1; return data; }
  if (status === 409) { skipped += 1; return null; }
  throw new Error('POST ' + path.replace(/[0-9a-f-]{36}/g, '…') + ' as ' + who + ': ' + status + ' ' + (data?.message ?? ''));
}
const step = (text) => console.log('✓ ' + text);

for (const who of ['emily', 'michael', 'jake', 'lily', 'linda']) await signIn(who, hosted && who === 'emily' ? env.DEMO_OWNER_PASSWORD : PASSWORD);
const family = (await must('emily', 'GET', '/families')).find((item) => item.isDefault);
assert.ok(family && /Carter/.test(family.name), 'The Carter demo family was not found.');
if (hosted) assert.equal(family.id, env.DEMO_FAMILY_ID, 'This is not the seeded staging family.');
const F = '/families/' + family.id;
const idOf = (key) => { const hash = createHash('sha256').update(family.id + ':' + key).digest('hex'); return hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-5' + hash.slice(13, 16) + '-a' + hash.slice(17, 20) + '-' + hash.slice(20, 32); };

const [Y, M, D] = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
const day = (n) => new Date(Date.UTC(Y, M - 1, D + n)).toISOString().slice(0, 10), weekday = (new Date(Date.UTC(Y, M - 1, D)).getUTCDay() + 6) % 7;
const week = day(-weekday), at = (n, time) => day(n) + 'T' + time;

// Chats
const chats = (await must('emily', 'GET', F + '/channels?kind=all&limit=100')).channels, chat = (name) => { const found = chats.find((item) => item.name === name); assert.ok(found, 'Chat "' + name + '" was not found.'); return found.id; };
const house = chat('Household'), ski = chat('Ski trip'), direct = (await must('emily', 'POST', F + '/channels/direct', { peerId: users.michael })).id;
const say = async (key, who, channel, body, extra = {}) => create(who, F + '/channels/' + channel + '/messages', { id: idOf('message:' + key), body, ...extra });
async function upload(key, who, channel, name, type, bytes, fields = {}) {
  const form = new FormData();
  form.set('id', idOf('file:' + key));
  for (const [field, value] of Object.entries(fields)) form.set(field, value);
  form.set('file', new Blob([bytes], { type }), name);
  return create(who, F + '/channels/' + channel + '/uploads', form);
}
const photo = async (name) => sharp(await readFile(new URL('../apps/web/public/photos/demo/' + name + '.webp', import.meta.url))).resize(1280).jpeg({ quality: 80 }).toBuffer();
async function post(key, who, channel, body, file) {
  // A message that is already there keeps its files; do not upload them twice.
  if ((await call(who, 'GET', F + '/channels/' + channel + '/messages/' + idOf('message:' + key))).status === 200) { skipped += 1; return; }
  await upload(key, who, channel, ...file);
  await say(key, who, channel, body, { fileIds: [idOf('file:' + key)] });
}
await post('birthday-photo', 'linda', house, 'Lily’s birthday in the backyard 🎂 Everyone is smiling at the same time, for once!', ['Backyard birthday.jpg', 'image/jpeg', await photo('backyard-birthday')]);
await post('grandma-voice', 'linda', house, '', ['Voice message.m4a', 'audio/mp4', await readFile(new URL('demo-media/grandma-voice.m4a', import.meta.url)), { voiceSeconds: '13' }]);
await post('clip', 'michael', ski, 'Made a little clip to get everyone in the mood for the trip', ['Family trips.mp4', 'video/mp4', await readFile(new URL('demo-media/weekend-clip.mp4', import.meta.url))]);
await post('road-photo', 'jake', ski, 'Remember this stop? Same snacks this time please', ['Road trip.jpg', 'image/jpeg', await photo('family-road-trip')]);
await post('rental', 'emily', ski, 'Rental car and ski hire details, all in one place', ['Rental details.txt', 'text/plain', 'Rental car: 7 seats, pick up at the airport counter, 10:30\nSki hire: Pine Ridge Rentals, 5 sets, 4 days\nHelmets: included for Lily and Jake\n']);
await say('faucet', 'linda', house, 'The kitchen faucet is worse today. Could someone call the plumber?');
await say('faucet-reply', 'michael', house, '@Linda Brooks calling them this afternoon', { replyToId: idOf('message:faucet'), mentionedUserIds: [users.linda] });
await say('gloves', 'lily', ski, 'I need new gloves, mine have a hole 🧤');
await say('gloves-reply', 'emily', ski, 'We’ll get some Saturday. Grey or purple?', { replyToId: idOf('message:gloves') });
await say('late', 'michael', direct, 'Running 10 minutes late, can you start the pasta?');
await say('late-reply', 'emily', direct, 'Already on. Bring parmesan 🧀');
const act = async (who, channel, key, action, body) => must(who, 'PUT', F + '/channels/' + channel + '/messages/' + idOf('message:' + key) + '/' + action, body);
for (const [who, channel, key, emoji] of [['emily', house, 'birthday-photo', '❤️'], ['lily', house, 'birthday-photo', '🎂'], ['jake', house, 'birthday-photo', '😂'], ['lily', house, 'grandma-voice', '❤️'], ['emily', ski, 'clip', '👍'], ['lily', ski, 'clip', '🎉'], ['emily', house, 'faucet-reply', '🙏']]) await act(who, channel, key, 'reaction', { emoji, active: true });
await act('emily', ski, 'rental', 'pin', { pinned: true });
await act('emily', house, 'birthday-photo', 'star', { starred: true });
if ((await call('emily', 'GET', F + '/channels/' + direct + '/messages/' + idOf('message:forwarded'))).status !== 200) await create('emily', F + '/channels/' + direct + '/forward', { id: idOf('message:forwarded'), conversationId: house, messageId: idOf('message:birthday-photo') });
const version = async (who, channel) => (await must(who, 'GET', F + '/channels/' + channel)).version;
await create('emily', F + '/channels/' + house + '/messages/' + idOf('message:faucet') + '/tasks', { id: idOf('task:faucet'), title: 'Call the plumber about the faucet', description: 'The kitchen faucet is dripping again.', audience: 'selected', selectedMemberIds: [users.michael, users.linda], assigneeId: users.michael, dueDate: day(1), remindMinutes: null, conversationVersion: await version('emily', house) });
await must('michael', 'PUT', F + '/channels/' + ski + '/mute', { muted: true });
step('Chat: photos, voice, video, replies, mentions, reactions, pin, star, forward, and a task made from a message');

// Announcements with admins, for group management.
await create('emily', F + '/channels', { id: idOf('channel:plans'), name: 'Holiday plans', emoji: '🎄', topic: 'Gifts, meals and who is hosting', description: 'Planning the holidays together.', memberIds: ['emily', 'michael', 'linda', 'lily', 'jake'].map((who) => users[who]).sort() });
const plans = idOf('channel:plans');
await say('plans-1', 'emily', plans, 'Christmas Eve dinner here at 6. Who brings what?');
await say('plans-2', 'linda', plans, 'Pie and the cranberry sauce!', { replyToId: idOf('message:plans-1') });
await post('plans-photo', 'linda', plans, 'Last Christmas morning 🎁', ['Christmas morning.jpg', 'image/jpeg', await photo('christmas-morning')]);
const group = await must('emily', 'GET', F + '/channels/' + plans);
if (!group.members.find((member) => member.userId === users.michael)?.admin) await must('emily', 'PUT', F + '/channels/' + plans + '/admins/' + users.michael, { version: group.version, admin: true });
step('A group with two admins');

// This week's plans
async function event(key, who, input) {
  const form = new FormData();
  form.set('event', JSON.stringify({ id: idOf('event:' + key + ':' + week), note: '', location: '', allDay: false, audience: 'family', selectedMemberIds: [], ...input }));
  const { status, data } = await call(who, 'POST', F + '/events', form);
  if (status === 200 || status === 201) { added += 1; return; }
  if (status === 409) { skipped += 1; return; }
  throw new Error('Event ' + key + ': ' + status + ' ' + (data?.message ?? ''));
}
const task = async (key, who, input, done) => {
  const made = await create(who, F + '/tasks', { id: idOf('task:' + key + ':' + week), description: '', audience: 'family', ...input });
  if (made && done) await must(who, 'PUT', F + '/tasks/' + made.id + '/status', { status: done, version: made.version });
};
await event('dentist', 'emily', { title: 'Lily — dentist cleaning', start: at(0, '15:30'), end: at(0, '16:15'), location: 'Maple Street Dental', remindMinutes: 60, remindAudience: 'everyone' });
await event('movie', 'jake', { title: 'Family movie night', start: at(0, '19:30'), end: at(0, '21:30'), location: 'Living room', note: 'Jake picks, Lily makes popcorn.' });
await event('budget', 'michael', { title: 'Monthly budget check-in', start: at(1, '20:00'), end: at(1, '20:30'), audience: 'selected', selectedMemberIds: [users.emily] });
await event('library', 'lily', { title: 'Library book return', start: at(2, '16:00'), end: at(2, '16:30'), location: 'Riverside Library' });
await event('game', 'jake', { title: 'Soccer match vs. Northside', start: at(4, '11:00'), end: at(4, '13:00'), location: 'Riverside Park, Field 1', remindMinutes: 1440, remindAudience: 'everyone' });
await event('brunch', 'linda', { title: 'Brunch with the cousins', start: at(5, '10:30'), end: at(5, '12:30'), location: 'Grandma’s house' });
await task('groceries', 'emily', { title: 'Weekly grocery order', description: 'Milk, eggs, spinach, chicken, rice, apples, oat bars.', assigneeId: users.emily, dueDate: day(0), dueTime: '18:00', remindMinutes: 60 });
await task('dishes', 'emily', { title: 'Empty the dishwasher', assigneeId: users.jake, dueDate: day(0) });
await task('essay', 'jake', { title: 'History essay outline', assigneeId: users.jake, dueDate: day(2) }, 'in_progress');
await task('gifts', 'emily', { title: 'Order Grandma’s gift', audience: 'selected', selectedMemberIds: [users.michael], assigneeId: users.michael, dueDate: day(3) });
await task('bills', 'michael', { title: 'Check the water bill', assigneeId: users.michael, dueDate: day(-1) });
await task('permission', 'emily', { title: 'Reply to the school survey', assigneeId: users.emily, dueDate: day(-1) }, 'completed');
step('This week: 6 events and 6 tasks');

// Family Base
const goals = (await must('emily', 'GET', F + '/goals?limit=50')).goals ?? [], tripGoal = goals.find((item) => item.title === 'Ski trip ready')?.id;
const entry = (key, who, kind, title, input = {}) => create(who, F + '/base/entries', { id: idOf('entry:' + key), kind, title, note: '', happenedOn: null, location: '', audience: 'family', selectedMemberIds: [], links: [], ...input });
const person = (...names) => names.map((name) => ({ kind: 'person', id: users[name] })), other = (...keys) => keys.map((key) => ({ kind: 'entry', id: idOf('entry:' + key) })), past = (months, date) => new Date(Date.UTC(Y, M - 1 - months, date)).toISOString().slice(0, 10);
await entry('lodge', 'emily', 'place', 'Pine Ridge Lodge', { location: 'Pine Ridge, Colorado', note: 'Quiet side of the mountain. Ask for a cabin near the shuttle.', links: person('emily', 'jake') });
await entry('park', 'michael', 'place', 'Riverside Park', { location: 'Field 4, Riverside Park', note: 'Jake’s home field. Park on Elm Street.', links: person('jake') });
await entry('grandma', 'linda', 'place', 'Grandma’s house', { location: '18 Orchard Lane', note: 'Sunday dinners since 2009.', links: person('linda') });
await entry('beach', 'emily', 'place', 'Cedar Cove beach', { location: 'Cedar Cove', note: 'Best shells at low tide.', links: person('lily') });
await entry('firstski', 'jake', 'memory', 'First time on the blue run', { happenedOn: past(9, 14), note: 'Fell twice, laughed the whole way down.', links: [...person('jake', 'michael'), ...other('lodge')] });
await entry('beachday', 'emily', 'memory', 'Beach day at Cedar Cove', { happenedOn: past(4, 20), note: 'Lily found 43 shells and kept every one.', links: [...person('lily', 'emily'), ...other('beach')] });
await entry('recital', 'linda', 'memory', 'Lily’s first piano recital', { happenedOn: past(6, 8), note: 'She bowed three times.', links: person('lily', 'linda') });
await entry('roadtrip', 'michael', 'memory', 'The great road trip', { happenedOn: past(15, 3), note: '1,900 miles, one flat tire and zero regrets.', links: person('michael', 'emily', 'jake', 'lily') });
await entry('thanks', 'linda', 'memory', 'Thanksgiving around the long table', { happenedOn: past(12, 27), links: [...person('linda', 'emily'), ...other('grandma')] });
await entry('garden', 'lily', 'idea', 'Build a butterfly garden', { note: 'Milkweed, coneflower and a small bench by the fence.', links: person('lily', 'linda') });
await entry('cabin', 'michael', 'idea', 'Summer cabin by the lake', { note: 'Look at the week after school ends.', links: person('michael', 'emily') });
await entry('skiweek', 'jake', 'idea', 'Learn to snowboard on the trip', { links: [...person('jake'), ...other('lodge'), ...(tripGoal ? [{ kind: 'goal', id: tripGoal }] : [])] });
await entry('surprise', 'emily', 'idea', 'Surprise 70th birthday for Grandma', { audience: 'selected', selectedMemberIds: [users.michael], note: 'Photo wall, her choir friends, and the good bakery.', links: person('michael') });
await entry('journal', 'emily', 'memory', 'A quiet morning', { audience: 'private', happenedOn: past(1, 2), note: 'Only Emily can see this one.' });
step('Family Base: 4 places, 6 memories and 4 ideas, with links, one selected and one private');

// Guest
let guest = 'kept as it was';
try { await signIn('nora', PASSWORD); } catch {
  const adminKey = env.SUPABASE_STORAGE_KEY;
  if (hosted && !(adminKey && env.JOBS_DATABASE_URL && env.INVITATION_TOKEN_SECRET)) guest = 'skipped: the API’s own settings are not available';
  else {
    const response = await fetch(AUTH + (hosted ? '/admin/users' : '/signup'), { method: 'POST', headers: hosted ? { apikey: adminKey, Authorization: 'Bearer ' + adminKey, 'Content-Type': 'application/json' } : authHeaders, body: JSON.stringify({ email: emails.nora, password: PASSWORD, ...(hosted ? { email_confirm: true, user_metadata: { demo: true } } : {}) }) });
    assert.ok(response.ok, 'Could not create the guest account (' + response.status + ').');
    if (!hosted) { const { default: pg } = await import('pg'); const db = new pg.Client({ connectionString: 'postgresql://supabase_admin:famsync-local-admin@127.0.0.1:55432/postgres' }); await db.connect(); try { await db.query('update auth.users set email_confirmed_at=now() where email=$1', [emails.nora]); } finally { await db.end(); } }
    await signIn('nora', PASSWORD);
    await must('nora', 'PUT', '/me/profile', { firstName: 'Nora', lastName: 'Patel', bio: (hosted ? 'Fictional staging demo. ' : '') + 'Neighbor and carpool partner.' });
  }
}
if (tokens.nora && !(await must('nora', 'GET', '/guest-channels?limit=20')).channels.some((item) => item.familyId === family.id)) {
  if (hosted && !(env.JOBS_DATABASE_URL && env.INVITATION_TOKEN_SECRET)) guest = 'account exists, invitation skipped: the API’s own settings are not available';
  else {
    const policy = await must('emily', 'GET', F + '/guest-policy');
    if (!policy.allowed) await must('emily', 'PUT', F + '/guest-policy', { allowed: true, version: policy.version });
    await create('emily', F + '/channels', { id: idOf('channel:carpool'), name: 'Soccer carpool', emoji: '⚽', topic: 'Who drives on which day', description: 'Shared with neighbors.', memberIds: ['emily', 'michael', 'jake'].map((who) => users[who]).sort() });
    const carpool = idOf('channel:carpool'), invitation = idOf('guest:nora');
    await create('emily', F + '/channels/' + carpool + '/guest-invitations', { id: invitation, email: emails.nora });
    const { default: pg } = await import('pg'), { invitationToken } = await import('../apps/api/dist/invitation-token.js');
    const db = new pg.Client({ connectionString: hosted ? env.JOBS_DATABASE_URL : 'postgresql://supabase_admin:famsync-local-admin@127.0.0.1:55432/postgres', connectionTimeoutMillis: 15000 });
    await db.connect();
    try {
      const { rows: [job] } = await db.query("select id, payload->>'attempt' as attempt from app.outbox where kind='guest.invitation.email' and payload->>'invitationId'=$1 order by created_at desc limit 1", [invitation]);
      assert.ok(job?.attempt, 'The guest invitation was not found.');
      await must('nora', 'POST', '/guest-invitations/accept', { token: invitationToken(job.attempt) });
      // The address is fictional, so no email is sent.
      await db.query("update app.outbox set status='done', finished_at=now() where id=$1", [job.id]);
    } finally { await db.end(); }
    await say('carpool-1', 'emily', carpool, 'Welcome Nora! I can drive Tuesday if you take Thursday.');
    await say('carpool-2', 'nora', carpool, 'Thursday works. Pickup at 4:10 by the gate?', { replyToId: idOf('message:carpool-1') });
    guest = 'added to Soccer carpool';
  }
}
step('Guest Nora Patel: ' + guest);
console.log('\nDone: ' + added + ' added, ' + skipped + ' already there.');
