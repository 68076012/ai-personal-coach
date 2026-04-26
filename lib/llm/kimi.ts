import OpenAI from "openai";
import {
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from "@google/genai";
import { GEMINI_MODEL } from "./models";

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

// Lowercase JSON-Schema type fields recursively. Gemini's SDK uses Type enum
// values (e.g. "STRING", "OBJECT"); OpenAI/Moonshot expects lowercase
// JSON-Schema strings.
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
      name: d.name ?? "unnamed",
      description: d.description ?? "",
      parameters: (normalizeSchema(d.parameters) as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    },
  }));
}

// Walks Gemini contents and emits a deterministic tool_call_id per (msg, part)
// so model.tool_calls and the matching role:"tool" responses line up.
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
  // Specific Moonshot model id. Caller decides — typically GEMINI_MODEL[tier]
  // for whichever Kimi tier was requested. Falls back to GEMINI_MODEL.kimi
  // for callers that don't specify (legacy).
  model?: string;
  systemInstruction: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
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
    model: params.model ?? GEMINI_MODEL.kimi,
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
