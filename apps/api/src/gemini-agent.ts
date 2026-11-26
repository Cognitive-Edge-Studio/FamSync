import { z } from "zod";
import { GeminiError } from "./gemini-client.js";

/** One action the model may ask for. `run` does the work on our side and returns plain data for the model. */
export type AgentTool = {
  name: string;
  description: string;
  parameters: object;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

export type AgentSettings = { apiKey: string; model: string; baseUrl: string };
export type AgentTurn = { role: "user" | "model"; text: string };

type Part = {
  text?: string; thought?: boolean; thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
type Content = { role: "user" | "model"; parts: Part[] };

const reply = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    content: z.object({ role: z.string().optional(), parts: z.array(z.looseObject({})).optional() }).optional(),
  })).optional(),
});

/** At most this many rounds of tool calls before the helper must answer. */
const maxRounds = 5;

/**
 * The helper's harness: send the context and the tool list, run any tools the model asks for, send their
 * results back, and repeat until the model writes a plain answer. The model never touches the database:
 * it can only ask for one of the given tools, and our code decides what that does.
 */
export async function runAgent({ settings, system, history = [], text, tools }: {
  settings: AgentSettings; system: string; history?: AgentTurn[]; text: string; tools: AgentTool[];
}, send: typeof fetch = fetch): Promise<{ answer: string; actions: string[] }> {
  const contents: Content[] = [
    ...history.map((turn): Content => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: "user", parts: [{ text }] },
  ];
  const actions: string[] = [];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  for (let round = 0; round <= maxRounds; round += 1) {
    // On the last round no tools are offered, so the model has to answer.
    const offer = round < maxRounds && tools.length > 0;
    const content = await generate(settings, system, contents, offer ? tools : [], send);
    const calls = content.parts.filter((part) => part.functionCall);
    if (!calls.length) {
      const answer = content.parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim();
      if (!answer) throw new GeminiError("failed");
      return { answer, actions };
    }
    // The model's turn goes back unchanged: Gemini needs its thought signatures to continue.
    contents.push(content);
    const responses: Part[] = [];
    for (const part of calls) {
      const call = part.functionCall!;
      const tool = byName.get(call.name);
      let response: Record<string, unknown>;
      try {
        if (!tool) throw new Error("Unknown tool");
        response = { result: await tool.run(call.args ?? {}) };
        actions.push(call.name);
      } catch (error) {
        response = { error: error instanceof Error ? error.message.slice(0, 200) : "The action failed." };
      }
      responses.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response } });
    }
    contents.push({ role: "user", parts: responses });
  }
  throw new GeminiError("failed");
}

async function generate(settings: AgentSettings, system: string, contents: Content[], tools: AgentTool[], send: typeof fetch): Promise<Content> {
  let response: Response;
  try {
    response = await send(settings.baseUrl + "/v1beta/models/" + encodeURIComponent(settings.model) + ":generateContent", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map(({ name, description, parameters }) => ({ name, description, parametersJsonSchema: parameters })) }] } : {}),
        generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "LOW" } },
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
  if (candidate?.finishReason !== "STOP" || !candidate.content?.parts?.length) throw new GeminiError("failed");
  return { role: "model", parts: candidate.content.parts as Part[] };
}
