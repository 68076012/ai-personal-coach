import { callLLM } from "./client";
import { ORCHESTRATOR_PROMPT } from "./prompts";
import type { AgentName } from "./models";

export type RoutedAgent = "trainer" | "nutritionist" | "meal_designer" | "reporter" | "general";

export interface RouteResult {
  agents: RoutedAgent[]; // dedup'd, ordered by relevance
  confidence: number;
  reason: string;
}

const QUICK_PATTERNS: { pattern: RegExp; agent: RoutedAgent; confidence: number }[] = [
  { pattern: /(set\b|รีพ\b|reps?\b|kg\s*\d|ออกกำลัง|ออกกำลังกาย|ฟิตเนส|เวท|cardio|เดิน|วิ่ง|squat|deadlift|bench|push.?up|pull.?up|พักหนึ่ง|RPE|workout)/i, agent: "trainer", confidence: 0.85 },
  { pattern: /(เมนู|recipe|แนะนำเมนู|วันนี้กินอะไร|พรุ่งนี้กินอะไร|grocery|วางเมนู|meal\s*plan)/i, agent: "meal_designer", confidence: 0.8 },
  { pattern: /(สรุป|รายงาน|progress|น้ำหนัก\s*(ขึ้น|ลด|เปลี่ยน)|รีวิวอาทิตย์|review)/i, agent: "reporter", confidence: 0.75 },
  { pattern: /(กิน|ทาน|มื้อ\s*(เช้า|กลางวัน|เย็น|ค่ำ)|อาหาร|kcal|kCal|cal\b|protein|carb|fat\s*g|โปรตีน|คาร์บ|ไขมัน|จาน|ถ้วย|ทัพพี|ชิ้น|แก้ว|ขนม|น้ำหวาน)/i, agent: "nutritionist", confidence: 0.85 },
];

// Preferred order when multiple agents fire on the same prompt — meal designer
// goes first because most "วาง X + Y" prompts lead with food, then trainer
// for the workout half. Reporter rarely co-occurs.
const ORDER: RoutedAgent[] = ["meal_designer", "trainer", "nutritionist", "reporter", "general"];

function dedupAndOrder(input: RoutedAgent[]): RoutedAgent[] {
  const set = new Set(input);
  return ORDER.filter((a) => set.has(a));
}

export async function routeMessage(message: string): Promise<RouteResult> {
  // 1. Fast path: regex matches. Compound prompts ("วาง workout + เมนู") fire
  // multiple patterns and we want all of them — previously we returned only
  // the first match and silently dropped the rest. Now we collect every
  // matching agent and dedup; the chat route runs each in sequence.
  const matched = QUICK_PATTERNS.filter((p) => p.pattern.test(message));
  if (matched.length > 0) {
    const agents = dedupAndOrder(matched.map((m) => m.agent));
    const confidence = Math.max(...matched.map((m) => m.confidence));
    return {
      agents,
      confidence,
      reason: agents.length > 1 ? `regex×${agents.length}` : "regex",
    };
  }

  // 2. LLM fallback (Kimi K2.6). Prompt was updated to optionally return an
  // `agents` array; fall back to single `agent` for backwards compatibility.
  try {
    const res = await callLLM({
      tier: "kimi",
      systemInstruction: ORCHESTRATOR_PROMPT,
      contents: [{ role: "user", parts: [{ text: message }] }],
      agent: "orchestrator",
    });
    const text = (res.text ?? "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const validAgents: RoutedAgent[] = ["trainer", "nutritionist", "meal_designer", "reporter", "general"];
      let agents: RoutedAgent[] = [];
      if (Array.isArray(parsed.agents)) {
        agents = parsed.agents.filter((a: unknown): a is RoutedAgent =>
          typeof a === "string" && (validAgents as string[]).includes(a),
        );
      } else if (typeof parsed.agent === "string" && (validAgents as string[]).includes(parsed.agent)) {
        agents = [parsed.agent as RoutedAgent];
      }
      if (agents.length === 0) agents = ["general"];
      agents = dedupAndOrder(agents);
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
      return { agents, confidence, reason: parsed.reason ?? "llm" };
    }
  } catch (err) {
    console.warn("[orchestrator] route fallback failed:", err);
  }

  return { agents: ["general"], confidence: 0, reason: "default" };
}

export function specialistFor(routed: RoutedAgent): Exclude<AgentName, "orchestrator"> {
  if (routed === "general") return "trainer";
  return routed;
}

export function specialistsFor(
  routed: RoutedAgent[],
): Array<Exclude<AgentName, "orchestrator">> {
  const out: Array<Exclude<AgentName, "orchestrator">> = [];
  const seen = new Set<string>();
  for (const r of routed) {
    const s = specialistFor(r);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

