import OpenAI from "openai";
import type {
  Content,
  FunctionCall,
  FunctionDeclaration,
  GenerateContentResponse,
} from "./types";
import { MODEL_ID } from "./models";

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MOONSHOT_API_KEY is not set. Add it to .env.local before falling through to Kimi.",
    );
  }
  const baseURL = process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.ai/v1";
  cachedClient = new OpenAI({ apiKey, baseURL });
  return cachedClient;
}

// Lowercase JSON-Schema type fields recursively. Tool declarations use
// uppercase Type enum values (e.g. "STRING", "OBJECT") — kept that way for
// historical reasons / readability — but OpenAI/Moonshot expects lowercase
// JSON-Schema strings on the wire.
function normalizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeSchema);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "type" && typeof v === "string") {
        out[k] = v.toLowerCase();
      } else {
        out[k] = normalizeSchema(v);
      }
    }
    return out;
  }
  return node;
}

function declarationsToOpenAITools(decls: FunctionDeclaration[]) {
  return decls.map((d) => ({
    type: "function" as const,
    function: {
      name: d.name,
      description: d.description ?? "",
      parameters: (normalizeSchema(d.parameters) as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    },
  }));
}

// Walks the contents array and emits a deterministic tool_call_id per
// (msg, part) so model.tool_calls and the matching role:"tool" responses
// line up.
function callIdFor(msgIdx: number, partIdx: number): string {
  return `call_${msgIdx}_${partIdx}`;
}

function contentsToMessages(
  systemInstruction: string,
  contents: Content[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemInstruction) {
    out.push({ role: "system", content: systemInstruction });
  }

  contents.forEach((c, msgIdx) => {
    const parts = c.parts ?? [];
    const role = c.role === "model" ? "assistant" : "user";

    if (role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
      parts.forEach((p, partIdx) => {
        if ("text" in p && typeof p.text === "string") textParts.push(p.text);
        if ("functionCall" in p && p.functionCall) {
          const fc = p.functionCall as { name?: string; args?: unknown };
          toolCalls.push({
            id: callIdFor(msgIdx, partIdx),
            type: "function" as const,
            function: {
              name: fc.name ?? "unknown",
              arguments: JSON.stringify(fc.args ?? {}),
            },
          } as OpenAI.Chat.Completions.ChatCompletionMessageToolCall);
        }
      });
      const message: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: textParts.join("\n") || null,
      };
      if (toolCalls.length) message.tool_calls = toolCalls;
      out.push(message);
      return;
    }

    // user role: text + functionResponse parts.
    // OpenAI requires one role:"tool" message per tool_call_id, so we split them.
    const textParts: string[] = [];
    parts.forEach((p, partIdx) => {
      if ("text" in p && typeof p.text === "string") textParts.push(p.text);
      if ("functionResponse" in p && p.functionResponse) {
        const fr = p.functionResponse as { name?: string; response?: unknown };
        out.push({
          role: "tool",
          tool_call_id: callIdFor(msgIdx - 1, partIdx),
          content: JSON.stringify(fr.response ?? {}),
        });
      }
    });
    if (textParts.length) {
      out.push({ role: "user", content: textParts.join("\n") });
    }
  });

  return out;
}

export interface CallKimiParams {
  // Specific Moonshot model id. Caller decides — typically MODEL_ID[tier]
  // for whichever tier was requested. Falls back to MODEL_ID.kimi for
  // callers that don't specify.
  model?: string;
  systemInstruction: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
}

export interface CallKimiStreamParams {
  model?: string;
  systemInstruction: string;
  contents: Content[];
  // Tool calls aren't supported on the streaming path yet — plan-coach
  // emits JSON inline in the assistant text, so we don't need them.
  onDelta: (chunk: string) => void;
}

// Returns a duck-typed object compatible with the subset of GenerateContentResponse
// the rest of the app actually reads (text, functionCalls, usageMetadata).
export async function callKimi(
  params: CallKimiParams,
): Promise<GenerateContentResponse> {
  const client = getClient();
  const messages = contentsToMessages(params.systemInstruction, params.contents);
  const tools = params.tools?.length
    ? declarationsToOpenAITools(params.tools)
    : undefined;

  // Don't pass temperature: Kimi K2.6 (and other reasoning-class Moonshot
  // models) reject any value other than 1 with "400 invalid temperature: only
  // 1 is allowed for this model". Letting Moonshot apply the model-specific
  // default avoids maintaining a per-model whitelist and keeps adding new
  // models risk-free.
  const completion = await client.chat.completions.create({
    model: params.model ?? MODEL_ID.kimi,
    messages,
    tools,
    tool_choice: tools ? "auto" : undefined,
  });

  const choice = completion.choices[0];
  const msg = choice?.message;
  const text = typeof msg?.content === "string" ? msg.content : "";

  const functionCalls: FunctionCall[] = (msg?.tool_calls ?? [])
    .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      tc.type === "function",
    )
    .map((tc) => {
      let args: unknown = {};
      try {
        args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        args = { _raw: tc.function.arguments };
      }
      return {
        name: tc.function.name,
        args: args as Record<string, unknown>,
      } as FunctionCall;
    });

  const usage = completion.usage;
  const shaped = {
    text,
    functionCalls: functionCalls.length ? functionCalls : undefined,
    usageMetadata: usage
      ? {
          promptTokenCount: usage.prompt_tokens,
          candidatesTokenCount: usage.completion_tokens,
          totalTokenCount: usage.total_tokens,
        }
      : undefined,
  } as unknown as GenerateContentResponse;

  return shaped;
}

// Streaming variant. Forwards each `choices[0].delta.content` chunk to
// `onDelta` as the model produces it, and resolves with the same shape as
// `callKimi` once the stream closes. Used by plan-coach so the chat UI sees
// tokens flow instead of a 30-90s heartbeat-only wait.
//
// Tool calls aren't surfaced here — plan-coach formats its answer as plain
// text + a JSON block, and parses the JSON server-side. If we ever need
// tools in a streamed path, this returns an empty `functionCalls` and
// callers must fall back to non-streaming.
export async function callKimiStream(
  params: CallKimiStreamParams,
): Promise<GenerateContentResponse> {
  const client = getClient();
  const messages = contentsToMessages(params.systemInstruction, params.contents);

  const stream = await client.chat.completions.create({
    model: params.model ?? MODEL_ID.kimi,
    messages,
    stream: true,
    // Moonshot honours OpenAI's `stream_options.include_usage` and emits the
    // usage block on the final chunk so we can keep llm_calls telemetry
    // accurate even on streamed calls.
    stream_options: { include_usage: true },
  });

  let fullText = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      fullText += delta;
      params.onDelta(delta);
    }
    if (chunk.usage) {
      usage = {
        prompt_tokens: chunk.usage.prompt_tokens,
        completion_tokens: chunk.usage.completion_tokens,
        total_tokens: chunk.usage.total_tokens,
      };
    }
  }

  const shaped = {
    text: fullText,
    functionCalls: undefined,
    usageMetadata: usage
      ? {
          promptTokenCount: usage.prompt_tokens,
          candidatesTokenCount: usage.completion_tokens,
          totalTokenCount: usage.total_tokens,
        }
      : undefined,
  } as unknown as GenerateContentResponse;

  return shaped;
}
