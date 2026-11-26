import assert from "node:assert/strict";
import { test } from "node:test";
import { checkedUrl } from "../src/lib/config.ts";
import { defaultFamily } from "../src/lib/family-choice.ts";
import { modules, shownModules } from "../src/lib/modules.ts";
import { chunkedStorage } from "../src/lib/secure-chunks.ts";

function store() {
  const values = new Map<string, string>();
  let failAt = Infinity, writes = 0;
  return { values, failAfter: (count: number) => { failAt = count; writes = 0; }, api: {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => { if (++writes > failAt) throw new Error("full"); assert.ok(Buffer.byteLength(value) <= 2048); values.set(key, value); },
    remove: async (key: string) => { values.delete(key); },
  } };
}

test("a large session is stored in parts, shrinks cleanly and is fully removed", async () => {
  const s = store(), storage = chunkedStorage(s.api), long = JSON.stringify({ token: "x".repeat(6000), name: "পরিবার 👨‍👩‍👧" });
  await storage.setItem("k", long);
  assert.equal(await storage.getItem("k"), long);
  await storage.setItem("k", "short");
  assert.equal(await storage.getItem("k"), "short");
  assert.equal(s.values.size, 2);
  await storage.setItem("k", long);
  await storage.removeItem("k");
  assert.equal(s.values.size, 0);
});

test("an interrupted write never yields a mixed session", async () => {
  const s = store(), storage = chunkedStorage(s.api);
  await storage.setItem("k", "a".repeat(5000));
  s.failAfter(2);
  await assert.rejects(storage.setItem("k", "b".repeat(5000)));
  assert.equal(await storage.getItem("k"), null);
});

test("release builds refuse plain HTTP and missing addresses", () => {
  assert.equal(checkedUrl("X", "https://api.test/", false), "https://api.test");
  assert.equal(checkedUrl("X", "http://10.0.2.2:4000", true), "http://10.0.2.2:4000");
  for (const value of ["http://api.test", "", undefined, "ftp://x", "javascript:alert(1)"]) assert.throws(() => checkedUrl("X", value, false));
});

test("the server's default family opens, and no family is a state of its own", () => {
  assert.equal(defaultFamily([{ id: "a", isDefault: false }, { id: "b", isDefault: true }])?.id, "b");
  assert.equal(defaultFamily([{ id: "a", isDefault: false }])?.id, "a");
  assert.equal(defaultFamily([]), undefined);
});

test("testers see only built modules", () => {
  assert.deepEqual(shownModules(false).map((module) => module.key), ["today", "tasks", "calendar", "chats", "helper", "goals", "files", "family", "guests", "notifications", 'family-base']);
  assert.equal(shownModules(true).length, modules.length);
});
