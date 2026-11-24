// Checks the real voice and AI keys with one short made-up sentence. It sends no family data and never prints a key.
//   node --env-file=.env.voice-test.local scripts/check-voice.mjs
import { listen, speak, spokenSeconds, voiceSettings } from '../apps/api/dist/elevenlabs-client.js';
import { askGemini } from '../apps/api/dist/gemini-client.js';

const settings = voiceSettings({ ...process.env, FAMILY_VOICE_ENABLED: 'true' });
if (!settings) { console.error('Fill in ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.voice-test.local.'); process.exit(1); }
const step = async (name, work) => { try { console.log('ok   ' + name + ': ' + await work()); return true; } catch (error) { console.log('FAIL ' + name + (error.status ? ' (' + error.status + ')' : ': ' + error.message)); process.exitCode = 1; return false; } };

await step('voice', async () => {
  const response = await fetch(settings.baseUrl + '/v1/voices/' + settings.voiceId, { headers: { 'xi-api-key': settings.apiKey }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw Object.assign(new Error('not found'), { status: response.status });
  const voice = await response.json();
  return voice.name + ' ' + JSON.stringify(voice.labels ?? {});
});
let sound;
const spoke = await step('speak', async () => { sound = await speak(settings, 'Hello. You have soccer practice on Thursday at five.'); return spokenSeconds(sound) + ' s of speech, ' + sound.length + ' bytes'; });
if (spoke) await step('listen', async () => JSON.stringify((await listen(settings, sound, 'audio/mpeg')).text));
if (process.env.GEMINI_API_KEY?.trim()) await step('answer', async () => (await askGemini({
  apiKey: process.env.GEMINI_API_KEY.trim(), model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash', baseUrl: 'https://generativelanguage.googleapis.com',
  system: 'Answer from the records in one sentence.', text: JSON.stringify({ records: [{ id: 'r1', kind: 'event', name: 'Soccer', when: 'Thursday 17:00' }], question: 'When is soccer?' }),
  schema: { type: 'object', properties: { answer: { type: 'string' }, records: { type: 'array', items: { type: 'string' } } }, required: ['answer', 'records'] },
})).answer);
else console.log('skip answer: GEMINI_API_KEY is empty');
