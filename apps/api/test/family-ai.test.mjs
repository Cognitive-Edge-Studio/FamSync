import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFamilyAiContext, familyAiSchema } from "../dist/family-ai-context.js";
import { askGemini, GeminiError } from "../dist/gemini-client.js";
import { provider } from "../dist/family-ai.service.js";

test("configured AI defaults on while missing credentials and explicit off stay unavailable", () => {
  const saved = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, FAMILY_AI_ENABLED: process.env.FAMILY_AI_ENABLED };
  try {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.FAMILY_AI_ENABLED;
    assert.ok(provider());
    process.env.FAMILY_AI_ENABLED = "false";
    assert.equal(provider(), null);
    process.env.FAMILY_AI_ENABLED = "yes";
    assert.equal(provider(), null);
    delete process.env.FAMILY_AI_ENABLED;
    delete process.env.GEMINI_API_KEY;
    assert.equal(provider(), null);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

const node = (id, kind, name, rest) => ({ id, kind, recordId: id.split(":")[1], name, status: null, when: null, progress: null, repeats: false,
  folderId: null, note: null, location: null, canEdit: false, you: false, ...rest });
const graph = {
  familyName: "Carter", truncated: ["task"], links: [{ source: "task:t-secret-id", target: "person:p-secret-id", relation: "assigned" }],
  nodes: [node("person:p-secret-id", "person", "Maya", { you: true }), node("task:t-secret-id", "task", "Pack", { when: "2026-11-25T02:30:00Z" }),
    node("idea:i1", "idea", "Long", { note: "x".repeat(2000) })],
};

test("the context carries short ids, local times and shortened notes", () => {
  const context = buildFamilyAiContext(graph, "What is due?", "America/Chicago", new Date("2026-11-24T03:00:00Z"));
  assert.ok(!context.text.includes("secret-id"));
  const data = JSON.parse(context.text);
  assert.match(data.today, /November 23, 2026/);
  assert.match(data.records[1].when, /^2026-11-24/);
  assert.match(data.records[1].when, /8:30|20:30/);
  assert.deepEqual(data.links, [["r2", "assigned", "r1"]]);
  assert.ok(data.records[2].note.endsWith("[shortened]"));
  assert.deepEqual(context.resolve(["r2", "r2", "r99", "person:p-secret-id"]), ["task:t-secret-id"]);
});

const options = { apiKey: "test-key", model: "m", baseUrl: "http://stub", system: "s", text: "t", schema: familyAiSchema };
const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });
const candidate = (text, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts: [{ text: "thinking", thought: true }, { text }] } }] });
const kind = (expected) => (error) => error instanceof GeminiError && error.kind === expected;

test("a valid reply is parsed, with the key only in its header", async () => {
  let sent;
  const result = await askGemini(options, async (url, init) => { sent = { url, init }; return reply(candidate('{"answer":"Pack","records":["r2"]}'))(); });
  assert.deepEqual(result, { answer: "Pack", records: ["r2"] });
  assert.ok(!String(sent.url).includes("test-key") && !sent.init.body.includes("test-key"));
  assert.equal(sent.init.headers["x-goog-api-key"], "test-key");
});

test("failures are told apart so only refused requests are given back", async () => {
  await assert.rejects(askGemini(options, reply({}, 429)), kind("refused"));
  await assert.rejects(askGemini(options, reply({}, 504)), kind("failed"));
  await assert.rejects(askGemini(options, async () => { throw new Error("offline"); }), kind("failed"));
  await assert.rejects(askGemini(options, reply({ promptFeedback: { blockReason: "SAFETY" } })), kind("blocked"));
  await assert.rejects(askGemini(options, reply(candidate("{}", "SAFETY"))), kind("blocked"));
  await assert.rejects(askGemini(options, reply(candidate('{"answer":"Pa', "MAX_TOKENS"))), kind("failed"));
  await assert.rejects(askGemini(options, reply(candidate("not json"))), kind("failed"));
  await assert.rejects(askGemini(options, reply({ candidates: [] })), kind("failed"));
});
