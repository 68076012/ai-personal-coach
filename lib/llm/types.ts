// Wire-format types for the LLM layer. Originally these were imported from
// @google/genai while the app spoke Gemini. Now that the app is Kimi-only
// (Moonshot via the OpenAI SDK), we keep the same shape so the existing
// Kimi adapter (which already normalizes to/from this format) and all the
// tool declarations (which use Type.X enum values) keep working unchanged.

export interface Part {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface Content {
  role: "user" | "model";
  parts: Part[];
}

export interface FunctionCall {
  name?: string;
  args?: Record<string, unknown>;
}

// JSON-Schema-ish shape used in FunctionDeclaration.parameters. Kept loose so
// existing tool declarations that pass extra hints (description, enum, items,
// minItems, maxItems, etc.) continue to type-check.
export interface Schema {
  type?: string;
  description?: string;
  enum?: readonly string[] | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  minItems?: string | number;
  maxItems?: string | number;
}

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Schema;
}

// Subset of @google/genai's GenerateContentResponse that the rest of the app
// reads. Kimi adapter returns an object shaped exactly like this.
export interface GenerateContentResponse {
  text?: string;
  functionCalls?: FunctionCall[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// Type enum — values are the uppercase JSON-Schema-ish strings @google/genai
// used. The Kimi adapter lowercases them on the wire (OpenAI/Moonshot
// expects lowercase). Kept as a const object (not TS enum) so it's
// tree-shakeable and works in both runtime and type positions.
export const Type = {
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  ARRAY: "ARRAY",
  OBJECT: "OBJECT",
} as const;

export type TypeValue = (typeof Type)[keyof typeof Type];
