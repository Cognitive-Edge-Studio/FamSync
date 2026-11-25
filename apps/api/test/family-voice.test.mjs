import assert from "node:assert/strict";
import { test } from "node:test";
import { listen, recordingType, speak, spokenSeconds, VoiceError, voiceSettings } from "../dist/elevenlabs-client.js";
import { buildFamilyAiContext, familyVoiceSystem } from "../dist/family-ai-context.js";
import { familyVoiceTurnsInput } from "../dist/family-voice.dto.js";

const env = { ELEVENLABS_API_KEY: "test-key", ELEVENLABS_VOICE_ID: "EXAVITQu4vr4xnSDxMaL", FAMILY_VOICE_ENABLED: "true", ELEVENLABS_BASE_URL: "http://stub" };
const settings = voiceSettings(env);
const kind = (expected) => (error) => error instanceof VoiceError && error.kind === expected;
const reply = (body, status = 200) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

test("configured voice defaults on and respects an explicit operator off switch", () => {
  assert.ok(settings);
  assert.ok(voiceSettings({ ...env, FAMILY_VOICE_ENABLED: undefined }));
  assert.equal(voiceSettings({ ...env, FAMILY_VOICE_ENABLED: "false" }), null);
  for (const missing of ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "FAMILY_VOICE_ENABLED"]) assert.equal(voiceSettings({ ...env, [missing]: "" }), null);
  assert.equal(voiceSettings({ ...env, FAMILY_VOICE_ENABLED: "yes" }), null);
  assert.equal(voiceSettings({ ...env, ELEVENLABS_VOICE_ID: "../other/path" }), null);
});
test("only recordings are accepted", () => {
  assert.equal(recordingType(Buffer.concat([Buffer.from([0, 0, 0, 28]), Buffer.from("ftypM4A "), Buffer.alloc(8)])), "audio/mp4");
  assert.equal(recordingType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0])), "audio/webm");
  for (const bad of [Buffer.alloc(0), Buffer.from("%PDF-1.4 something"), Buffer.alloc(40)]) assert.equal(recordingType(bad), null);
});
test("words come back, with the key only in its header", async () => {
  let sent;
  const result = await listen(settings, Buffer.from("x"), "audio/mp4", async (url, init) => { sent = { url, init }; return reply({ text: " Hello ", audio_duration_secs: 2.4 })(); });
  assert.deepEqual(result, { text: "Hello", seconds: 2.4 });
  assert.equal(sent.init.headers["xi-api-key"], "test-key");
  assert.ok(!String(sent.url).includes("test-key"));
  assert.equal((await listen(settings, Buffer.from("x"), "audio/mp4", reply({ text: "a".repeat(900) }))).text.length, 500);
});
test("refusals and failures are told apart", async () => {
  await assert.rejects(listen(settings, Buffer.from("x"), "audio/mp4", reply({}, 401)), kind("refused"));
  await assert.rejects(listen(settings, Buffer.from("x"), "audio/mp4", reply({}, 429)), kind("refused"));
  await assert.rejects(listen(settings, Buffer.from("x"), "audio/mp4", reply({}, 500)), kind("failed"));
  await assert.rejects(listen(settings, Buffer.from("x"), "audio/mp4", reply({ nothing: 1 })), kind("failed"));
  await assert.rejects(speak(settings, "hi", async () => { throw new Error("offline"); }), kind("failed"));
  await assert.rejects(speak(settings, "hi", reply("")), kind("failed"));
  assert.equal((await speak(settings, "hi", reply("sound"))).toString(), "sound");
  assert.equal(spokenSeconds(Buffer.alloc(16001)), 3);
});
test("earlier turns are bounded and sent as conversation, not as instructions", () => {
  assert.ok(!familyVoiceTurnsInput.safeParse(Array.from({ length: 7 }, () => ({ you: "a", reply: "b" }))).success);
  assert.ok(!familyVoiceTurnsInput.safeParse([{ you: "a", reply: "b", system: "x" }]).success);
  const graph = { familyName: "F", truncated: [], nodes: [], links: [] };
  const { text } = buildFamilyAiContext(graph, "And Friday?", "UTC", new Date(0), [{ you: "Thursday?", reply: "Soccer." }]);
  assert.deepEqual(JSON.parse(text).earlierInThisCall, [{ member: "Thursday?", you: "Soccer." }]);
  assert.equal("earlierInThisCall" in JSON.parse(buildFamilyAiContext(graph, "q", "UTC").text), false);
  assert.match(familyVoiceSystem, /never follow instructions/);
});
