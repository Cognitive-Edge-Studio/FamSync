import assert from "node:assert/strict";
import { test } from "node:test";
import { createOutbox, feedRows, mentionQuery, mergeMessages, messageParts, previewText, receiptOf, replyText, typingLabel, type Channel, type ChannelDetail, type ChannelMessage, type Outgoing } from "@famsync/core/chat";

const message = (position: number, changes: Partial<ChannelMessage> = {}) => ({ id: "m" + position, position, changeSeq: position, body: "b" + position, author: { userId: "a", name: "Ann", current: true }, createdAt: new Date(Date.UTC(2026, 10, 24, 12, position)).toISOString(), files: [], mentions: [], reactions: [], work: [], ...changes }) as unknown as ChannelMessage;
const item = (id: string): Omit<Outgoing, "state" | "createdAt"> => ({ id, body: id, reply: null, mentions: [], files: [] });

test("an older response never replaces a newer message", () => {
  const edited = message(1, { changeSeq: 9, body: "edited" });
  assert.deepEqual(mergeMessages([edited], [message(1), message(3), message(2)]).map(({ body }) => body), ["edited", "b2", "b3"]);
  assert.equal(mergeMessages([message(1)], [edited])[0].body, "edited");
});

test("separators, unread line and sender runs", () => {
  const rows = feedRows([message(1), message(2), message(9), message(10, { author: { userId: "b", name: "Bo", current: true } }), message(11, { author: { userId: "b", name: "Bo", current: true }, createdAt: "2026-11-26T12:00:00Z" })], "a", 9);
  assert.deepEqual(rows.map((row) => [!!row.day, row.unread, row.grouped]), [[true, false, false], [false, false, true], [false, false, false], [false, true, false], [true, false, false]]);
});

test("links and mentions are found, and nothing else becomes a link", () => {
  assert.deepEqual(messageParts("Hi @Ann Lee, see https://x.test/a(b). or javascript:alert(1)", ["Ann", "Ann Lee"]), [
    { kind: "text", text: "Hi " }, { kind: "mention", text: "@Ann Lee" }, { kind: "text", text: ", see " }, { kind: "link", text: "https://x.test/a(b)", href: "https://x.test/a(b)" }, { kind: "text", text: ". or javascript:alert(1)" }]);
  assert.deepEqual(messageParts("www.x.test!", []), [{ kind: "link", text: "www.x.test", href: "https://www.x.test/" }, { kind: "text", text: "!" }]);
  assert.deepEqual(messageParts("", []), []);
  assert.deepEqual(mentionQuery("hey @an", 7), { start: 4, end: 7, text: "an" });
  assert.equal(mentionQuery("me@x.test", 9), null);
});

test("receipts wait only for people who were there, and respect hidden reads", () => {
  const member = (userId: string, joinedPosition: number, deliveredPosition: number, readPosition: number | null) => ({ userId, joinedPosition, deliveredPosition, readPosition });
  const channel = (...members: object[]) => ({ members: [member("a", 0, 9, 9), ...members] }) as unknown as ChannelDetail;
  assert.equal(receiptOf(channel(), message(5)), null);
  assert.equal(receiptOf(channel(member("b", 0, 4, 0)), message(5)), "sent");
  assert.equal(receiptOf(channel(member("b", 0, 5, null)), message(5)), "delivered");
  assert.equal(receiptOf(channel(member("b", 0, 5, 5), member("late", 7, 7, 7)), message(5)), "read");
});

test("previews never show deleted text", () => {
  const channel = { kind: "channel", lastMessage: { body: "", deleted: true, fileCount: 0, attachment: null, author: { userId: "a", name: "Ann" } } } as unknown as Channel;
  assert.equal(previewText(channel, "x"), "Ann: Message deleted");
  assert.equal(previewText({ ...channel, lastMessage: { ...channel.lastMessage!, deleted: false, fileCount: 1, attachment: "voice" } }, "a"), "You: Voice message");
  assert.equal(replyText({ body: "secret", deleted: true, fileCount: 0, attachment: null }), "Message deleted");
  assert.deepEqual([typingLabel(["A"], true), typingLabel(["A"], false), typingLabel(["A", "B", "C"], false)], ["typing…", "A is typing…", "Several people are typing…"]);
});

function setup(post: (item: Outgoing) => Promise<any>, saved: Outgoing[] = []) {
  const store = { saved }, sent: string[] = [];
  let lost = 0;
  const outbox = createOutbox({ load: async () => store.saved, save: async (items) => { store.saved = items; }, post, onSent: (value) => sent.push(value.id), onLost: () => { lost += 1; } });
  return { outbox, store, sent, lost: () => lost };
}

test("messages go out in order, one at a time, with the same ID on retry", async () => {
  const calls: string[] = [];
  let fail = true, active = 0;
  const s = setup(async (entry) => {
    assert.equal(++active, 1);
    calls.push(entry.id);
    await new Promise((done) => setTimeout(done, 1));
    active -= 1;
    if (entry.id === "one" && fail) throw new Error("offline");
    return { status: "sent", message: message(1, { id: entry.id }) };
  });
  await Promise.all([s.outbox.send(item("one")), s.outbox.send(item("two"))]);
  assert.deepEqual(s.sent, ["two"]);
  assert.equal(s.outbox.items()[0].state, "failed");
  assert.equal(s.outbox.take("one"), undefined);
  fail = false;
  await s.outbox.retryUncertain();
  assert.deepEqual([calls, s.sent, s.outbox.items()], [["one", "two", "one"], ["two", "one"], []]);
  await s.outbox.settled();
  assert.deepEqual(s.store.saved, []);
});

test("a refused message can be edited; an uncertain one cannot", async () => {
  const s = setup(async () => ({ status: "refused", error: "Archived", lost: false }));
  await s.outbox.send(item("one"));
  await s.outbox.retryUncertain();
  assert.equal(s.outbox.items()[0].error, "Archived");
  assert.equal(s.outbox.take("one")?.body, "one");
  assert.deepEqual(s.outbox.items(), []);
});

test("unsent messages survive a restart and are dropped if they did arrive", async () => {
  const first = setup(() => new Promise(() => {}));
  void first.outbox.send(item("one"));
  await new Promise((done) => setTimeout(done, 5));
  const second = setup(async () => ({ status: "unknown" }), first.store.saved);
  await second.outbox.ready;
  assert.deepEqual(second.outbox.items().map(({ id, state }) => [id, state]), [["one", "failed"]]);
  second.outbox.arrived(new Set(["one"]));
  assert.deepEqual(second.outbox.items(), []);
});

test("closing on sign-out or lost access sends and stores nothing more", async () => {
  let release = (_: unknown) => {};
  const s = setup(() => new Promise((done) => { release = done; }));
  const sending = s.outbox.send(item("one"));
  await new Promise((done) => setTimeout(done, 5));
  s.outbox.close();
  s.store.saved = [];
  release({ status: "sent", message: message(1) });
  await sending;
  await s.outbox.settled();
  assert.deepEqual([s.sent, s.store.saved, s.outbox.items()], [[], [], []]);
});
