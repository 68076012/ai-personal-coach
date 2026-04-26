// Gemini occasionally regresses to emitting tool calls as `tool_code`
// markdown blocks instead of using native function calling. The
// surrounding text typically looks like:
//
//   tool_code
//   print(default_api.propose_plan_bulk(...))
//   thought
//   The user has confirmed...
//
// When this happens the actual function call is missing (the SDK never
// fires it), so the propose_plan_bulk pending row is never created and
// the chat just shows pseudo-Python in the bubble. We can't recover the
// dropped action, but we can keep the bubble text readable by stripping
// these blocks before render and warn the user that the agent should
// have called a tool.
//
// Patterns to remove:
//   - A line `tool_code` (case-insensitive) and everything until the
//     next blank line / start-of-block keyword
//   - A line `thought` and the same trailing block
//   - Standalone ```tool_code``` or ```thought``` fenced blocks
//   - Inline `default_api.<tool>(...)` literal calls embedded in prose

const FENCED_BLOCK = /```(?:tool_code|thought)[\s\S]*?```/gi;
const BARE_LABEL_BLOCK = /(^|\n)\s*(tool_code|thought)\b[\s\S]*?(?=\n\s*\n|$)/gi;
const INLINE_DEFAULT_API_CALL = /default_api\.[A-Za-z0-9_]+\([\s\S]*?\)\s*\)?/g;

export interface SanitizeResult {
  cleaned: string;
  hadToolCodeText: boolean;
}

export function sanitizeAssistantText(raw: string): SanitizeResult {
  if (!raw) return { cleaned: "", hadToolCodeText: false };
  let s = raw;
  let hit = false;

  if (FENCED_BLOCK.test(s)) {
    hit = true;
    s = s.replace(FENCED_BLOCK, "");
  }
  if (BARE_LABEL_BLOCK.test(s)) {
    hit = true;
    s = s.replace(BARE_LABEL_BLOCK, "");
  }
  if (INLINE_DEFAULT_API_CALL.test(s)) {
    hit = true;
    s = s.replace(INLINE_DEFAULT_API_CALL, "");
  }

  // Tidy: collapse 3+ newlines to 2, trim ends.
  s = s.replace(/\n{3,}/g, "\n\n").trim();

  return { cleaned: s, hadToolCodeText: hit };
}
