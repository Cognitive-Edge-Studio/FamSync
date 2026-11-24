import { z } from "zod";

/** Why a question got no answer. `refused` means the service rejected the request, so it did no work. */
export class GeminiError extends Error {
  constructor(readonly kind: "refused" | "blocked" | "failed", readonly status?: number) { super("Gemini " + kind); }
}

const reply = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).optional() }).optional(),
  })).optional(),
});
const answer = z.object({ answer: z.string().trim().min(1).max(4000), records: z.array(z.string()).max(200) });
export type GeminiAnswer = z.infer<typeof answer>;

export async function askGemini({ apiKey, model, baseUrl, system, text, schema }: {
  apiKey: string; model: string; baseUrl: string; system: string; text: string; schema: object;
}, send: typeof fetch = fetch): Promise<GeminiAnswer> {
  let response: Response;
  try {
    response = await send(baseUrl + "/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "LOW" } },
      }),
    });
  } catch {
    throw new GeminiError("failed");
  }
  if (!response.ok) throw new GeminiError(response.status === 504 ? "failed" : "refused", response.status);
  let body: z.infer<typeof reply>;
  try { body = reply.parse(await response.json()); } catch { throw new GeminiError("failed"); }
  const candidate = body.candidates?.[0];
  if (body.promptFeedback?.blockReason || ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(candidate?.finishReason ?? "")) {
    throw new GeminiError("blocked");
  }
  if (candidate?.finishReason !== "STOP") throw new GeminiError("failed");
  const output = (candidate.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? "").join("");
  try { return answer.parse(JSON.parse(output)); } catch { throw new GeminiError("failed"); }
}
