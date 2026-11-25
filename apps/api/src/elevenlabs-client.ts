import { z } from "zod";

/** Why there was no speech. `refused` means the service rejected the request, so it did no work. */
export class VoiceError extends Error {
  constructor(readonly kind: "refused" | "failed", readonly step: "listen" | "speak", readonly status?: number) { super("Voice " + step + " " + kind); }
}
export type VoiceSettings = { apiKey: string; baseUrl: string; voiceId: string; listenModel: string; speakModel: string };

/** Configured voice is on by default. An explicit false remains the operator's kill switch. */
export function voiceSettings(env: Record<string, string | undefined>): VoiceSettings | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim(), voiceId = env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId || !/^[A-Za-z0-9]{10,40}$/.test(voiceId) || (env.FAMILY_VOICE_ENABLED ?? "true") !== "true") return null;
  return {
    apiKey, voiceId, baseUrl: env.ELEVENLABS_BASE_URL?.trim() || "https://api.elevenlabs.io",
    listenModel: env.ELEVENLABS_LISTEN_MODEL?.trim() || "scribe_v3", speakModel: env.ELEVENLABS_SPEAK_MODEL?.trim() || "eleven_flash_v2_5",
  };
}

const heard = z.object({ text: z.string(), audio_duration_secs: z.number().nonnegative().nullish() });
const refusedOr = (status: number) => status >= 400 && status < 500 ? "refused" as const : "failed" as const;

export const recordingType = (bytes: Buffer): "audio/mp4" | "audio/webm" | null =>
  bytes.length > 12 && bytes.toString("latin1", 4, 8) === "ftyp" ? "audio/mp4" : bytes.length > 4 && bytes.readUInt32BE(0) === 0x1a45dfa3 ? "audio/webm" : null;

/** Turns a short recording into words. The service's own labels for background sounds are left out. */
export async function listen(settings: VoiceSettings, audio: Buffer, type: string, send: typeof fetch = fetch) {
  const form = new FormData();
  form.set("model_id", settings.listenModel);
  form.set("tag_audio_events", "false");
  form.set("file", new Blob([new Uint8Array(audio)], { type }), type === "audio/webm" ? "voice.webm" : "voice.m4a");
  let response: Response;
  try { response = await send(settings.baseUrl + "/v1/speech-to-text", { method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000), headers: { "xi-api-key": settings.apiKey }, body: form }); }
  catch { throw new VoiceError("failed", "listen"); }
  if (!response.ok) throw new VoiceError(refusedOr(response.status), "listen", response.status);
  try {
    const result = heard.parse(await response.json());
    return { text: result.text.trim().slice(0, 500), seconds: result.audio_duration_secs ?? null };
  } catch { throw new VoiceError("failed", "listen"); }
}

const maxSpeech = 3 * 1048576;
export async function speak(settings: VoiceSettings, text: string, send: typeof fetch = fetch): Promise<Buffer> {
  let response: Response;
  try {
    response = await send(settings.baseUrl + "/v1/text-to-speech/" + settings.voiceId + "?output_format=mp3_44100_64", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
      headers: { "xi-api-key": settings.apiKey, "Content-Type": "application/json" },
      // A little expressive, unhurried and steady.
      body: JSON.stringify({ text, model_id: settings.speakModel, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 0.98 } }),
    });
  } catch { throw new VoiceError("failed", "speak"); }
  if (!response.ok) throw new VoiceError(refusedOr(response.status), "speak", response.status);
  try {
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > maxSpeech) throw new Error();
    return audio;
  } catch { throw new VoiceError("failed", "speak"); }
}
/** 64 kbit/s is 8,000 bytes a second. */
export const spokenSeconds = (audio: Buffer) => Math.ceil(audio.length / 8000);
