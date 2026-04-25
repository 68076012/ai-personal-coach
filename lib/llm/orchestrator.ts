import { Type } from "@google/genai";
import { callGemini } from "./client";
import { ORCHESTRATOR_PROMPT } from "./prompts";
import type { AgentName } from "./models";

export type RoutedAgent = "trainer" | "nutritionist" | "meal_designer" | "reporter" | "general";

export interface RouteResult {
  agent: RoutedAgent;
  confidence: number;
  reason: string;
}

const QUICK_PATTERNS: { pattern: RegExp; agent: RoutedAgent; confidence: number }[] = [
  { pattern: /(set\b|รีพ\b|reps?\b|kg\s*\d|ออกกำลังกาย|ฟิตเนส|เวท|cardio|เดิน|วิ่ง|squat|deadlift|bench|push.?up|pull.?up|พักหนึ่ง|RPE)/i, agent: "trainer", confidence: 0.85 },
  { pattern: /(เมนู|recipe|แนะนำเมนู|วันนี้กินอะไร|พรุ่งนี้กินอะไร|grocery|วางเมนู)/i, agent: "meal_designer", confidence: 0.8 },
  { pattern: /(สรุป|รายงาน|progress|น้ำหนัก\s*(ขึ้น|ลด|เปลี่ยน)|รีวิวอาทิตย์|review)/i, agent: "reporter", confidence: 0.75 },
  { pattern: /(กิน|ทาน|มื้อ\s*(เช้า|กลางวัน|เย็น|ค่ำ)|อาหาร|kcal|kCal|cal\b|protein|carb|fat\s*g|โปรตีน|คาร์บ|ไขมัน|จาน|ถ้วย|ทัพพี|ชิ้น|แก้ว|ขนม|น้ำหวาน)/i, agent: "nutritionist", confidence: 0.85 },
];

export async function routeMessage(message: string): Promise<RouteResult> {
  // 1. fast path: regex matches → skip LLM
  for (const p of QUICK_PATTERNS) {
    if (p.pattern.test(message)) {
      return { agent: p.agent, confidence: p.confidence, reason: "regex" };
    }
  }

  // 2. LLM fallback (Flash-Lite, JSON mode)
  try {
    const res = await callGemini({
      tier: "flash-lite",
      systemInstruction: ORCHESTRATOR_PROMPT,
      contents: [{ role: "user", parts: [{ text: message }] }],
      agent: "orchestrator",
    });
    // Use responseSchema would be nicer; fall back to text JSON parse
    const text = (res.text ?? "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const agent = ["trainer", "nutritionist", "meal_designer", "reporter", "general"].includes(parsed.agent)
        ? (parsed.agent as RoutedAgent)
        : "general";
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0)));
      return { agent, confidence, reason: parsed.reason ?? "llm" };
    }
  } catch (err) {
    console.warn("[orchestrator] route fallback failed:", err);
  }

  return { agent: "general", confidence: 0, reason: "default" };
}

export function specialistFor(routed: RoutedAgent): Exclude<AgentName, "orchestrator"> {
  if (routed === "general") return "trainer";
  return routed;
}

// Re-export so we don't need Type import elsewhere unused
export const _Type = Type;
