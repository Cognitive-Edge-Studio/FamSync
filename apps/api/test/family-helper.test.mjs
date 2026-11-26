import assert from "node:assert/strict";
import { test } from "node:test";
import { runAgent } from "../dist/gemini-agent.js";
import { GeminiError } from "../dist/gemini-client.js";
import { FamilyHelperService, plain } from "../dist/family-helper.service.js";

test("ask-everyone deadlines are read in the family's time zone", () => {
  // 10:00 in Chicago on 26 Nov 2026 is 16:00 UTC.
  const now = new Date("2026-11-26T16:00:00Z"), zone = "America/Chicago";
  assert.equal(FamilyHelperService.deadline({ minutes: 30 }, zone, now).toISOString(), "2026-11-26T16:30:00.000Z");
  assert.equal(FamilyHelperService.deadline({ closesAt: "18:00" }, zone, now).toISOString(), "2026-11-27T00:00:00.000Z");
  // A time already passed today means tomorrow.
  assert.equal(FamilyHelperService.deadline({ closesAt: "9:30" }, zone, now).toISOString(), "2026-11-27T15:30:00.000Z");
  assert.equal(FamilyHelperService.deadline({ closesAt: "2026-11-28T12:00" }, zone, now).toISOString(), "2026-11-28T18:00:00.000Z");
  // 12-hour times, and a clock time winning over minutes the model may have worked out wrongly.
  assert.equal(FamilyHelperService.deadline({ closesAt: "9pm" }, zone, now).toISOString(), "2026-11-27T03:00:00.000Z");
  assert.equal(FamilyHelperService.deadline({ closesAt: "9:30 a.m." }, zone, now).toISOString(), "2026-11-27T15:30:00.000Z");
  assert.equal(FamilyHelperService.deadline({ closesAt: "12pm" }, zone, now).toISOString(), "2026-11-26T18:00:00.000Z");
  assert.equal(FamilyHelperService.deadline({ closesAt: "21:00", minutes: 480 }, zone, now).toISOString(), "2026-11-27T03:00:00.000Z");
  // An exact timestamp with an offset is taken as given.
  assert.equal(FamilyHelperService.deadline({ closesAt: "2026-11-27T03:00:00Z" }, zone, now).toISOString(), "2026-11-27T03:00:00.000Z");
  assert.equal(FamilyHelperService.deadline({ closesAt: "2026-11-26T21:00:00-06:00" }, zone, now).toISOString(), "2026-11-27T03:00:00.000Z");
  // Nothing usable: two hours.
  assert.equal(FamilyHelperService.deadline({ closesAt: "soon" }, zone, now).toISOString(), "2026-11-26T18:00:00.000Z");
});

test("a retried reply job reuses the same message id, so it never posts twice", () => {
  const first = FamilyHelperService["replyId"]("6f1c2b0a-1111-4222-8333-444455556666");
  assert.equal(first, FamilyHelperService["replyId"]("6f1c2b0a-1111-4222-8333-444455556666"));
  assert.notEqual(first, FamilyHelperService["replyId"]("6f1c2b0a-1111-4222-8333-444455556667"));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("Markdown the model writes is shown as plain text", () => {
  assert.equal(plain("**Unread Messages**\n- **Ski trip:** gloves\n* Milk\n## Today\n__soon__"), "Unread Messages\n- Ski trip: gloves\n- Milk\nToday\nsoon");
  assert.equal(plain("2 * 3 = 6, keep the star"), "2 * 3 = 6, keep the star");
});

const settings = { apiKey: "test-key", model: "test-model", baseUrl: "https://gemini.test" };
const reply = (parts) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts } }] }), { status: 200 });

test("the harness runs requested tools, sends results back unchanged, and returns the final answer", async () => {
  const bodies = [];
  const added = [];
  const send = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) return reply([{ functionCall: { id: "c1", name: "add_to_shopping_list", args: { items: [{ title: "Milk" }] } }, thoughtSignature: "sig" }]);
    return reply([{ text: "Added milk to the list." }]);
  };
  const tools = [{ name: "add_to_shopping_list", description: "Adds items", parameters: { type: "object", properties: {} },
    run: async (args) => { added.push(...args.items.map((item) => item.title)); return { items: added }; } }];
  const result = await runAgent({ settings, system: "s", text: "add milk", tools }, send);
  assert.deepEqual(result, { answer: "Added milk to the list.", actions: ["add_to_shopping_list"] });
  assert.deepEqual(added, ["Milk"]);
  assert.equal(bodies[0].tools[0].functionDeclarations[0].name, "add_to_shopping_list");
  // The model's call keeps its thought signature, and the tool result is matched to the call id.
  assert.equal(bodies[1].contents[1].parts[0].thoughtSignature, "sig");
  assert.deepEqual(bodies[1].contents[2].parts[0].functionResponse, { id: "c1", name: "add_to_shopping_list", response: { result: { items: ["Milk"] } } });
});

test("a failing or unknown tool is reported to the model instead of stopping the reply", async () => {
  const bodies = [];
  const send = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) return reply([{ functionCall: { name: "explode", args: {} } }, { functionCall: { name: "missing", args: {} } }]);
    return reply([{ text: "Sorry, that didn't work." }]);
  };
  const tools = [{ name: "explode", description: "x", parameters: { type: "object" }, run: async () => { throw new Error("Boom"); } }];
  const result = await runAgent({ settings, system: "s", text: "go", tools }, send);
  assert.equal(result.answer, "Sorry, that didn't work.");
  assert.deepEqual(result.actions, []);
  assert.deepEqual(bodies[1].contents[2].parts.map((part) => part.functionResponse.response.error), ["Boom", "Unknown tool"]);
});

test("the harness stops offering tools after five rounds so the model must answer", async () => {
  let calls = 0;
  const send = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(init.body);
    return body.tools ? reply([{ functionCall: { name: "loop", args: {} } }]) : reply([{ text: "Done." }]);
  };
  const tools = [{ name: "loop", description: "x", parameters: { type: "object" }, run: async () => ({}) }];
  const result = await runAgent({ settings, system: "s", text: "go", tools }, send);
  assert.equal(result.answer, "Done.");
  assert.equal(calls, 6);
});

test("blocked and refused replies surface as Gemini errors", async () => {
  const blocked = async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 });
  await assert.rejects(runAgent({ settings, system: "s", text: "x", tools: [] }, blocked), (error) => error instanceof GeminiError && error.kind === "blocked");
  const refused = async () => new Response("{}", { status: 403 });
  await assert.rejects(runAgent({ settings, system: "s", text: "x", tools: [] }, refused), (error) => error instanceof GeminiError && error.kind === "refused");
});

test("the helper only answers when spoken to by name", () => {
  const speaks = (body) => FamilyHelperService.addresses(body, "Juniper");
  assert.ok(speaks("@Juniper what's for dinner?"));
  assert.ok(speaks("hey @juniper add eggs"));
  assert.ok(speaks("Juniper, catch me up"));
  assert.ok(speaks("Hey Juniper: add eggs"));
  assert.ok(!speaks("I planted juniper today"));
  assert.ok(!speaks("@Junipers are nice"));
  assert.ok(FamilyHelperService.addresses("@Mr. Bee add milk", "Mr. Bee"));
});
