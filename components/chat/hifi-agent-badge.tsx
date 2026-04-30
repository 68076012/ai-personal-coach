import { Dumbbell, Apple, ChefHat, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const AGENT_META = {
  // "coach" is the unified chat agent. The legacy specialist entries are
  // kept so historical assistant rows (filed under their old agent_type)
  // still render with the badge they originally shipped with.
  coach: {
    label: "Coach",
    emoji: "✨",
    icon: Sparkles,
    tone: "bg-[var(--accent-soft)] text-[var(--accent)]",
  },
  trainer: {
    label: "Trainer",
    emoji: "💪",
    icon: Dumbbell,
    tone: "bg-[var(--sun-soft)] text-[#8a6712]",
  },
  nutritionist: {
    label: "Nutritionist",
    emoji: "🥗",
    icon: Apple,
    tone: "bg-[var(--leaf-soft)] text-[var(--leaf)]",
  },
  meal_designer: {
    label: "Chef",
    emoji: "🍽",
    icon: ChefHat,
    tone: "bg-[var(--coral-soft)] text-[var(--coral)]",
  },
  reporter: {
    label: "Reporter",
    emoji: "📊",
    icon: FileText,
    tone: "bg-[var(--sky-soft)] text-[var(--sky)]",
  },
  orchestrator: {
    label: "Coach",
    emoji: "✨",
    icon: Sparkles,
    tone: "bg-[var(--accent-soft)] text-[var(--accent)]",
  },
} as const;

export type AgentKey = keyof typeof AGENT_META;

export function HiFiAgentBadge({ agent }: { agent: AgentKey }) {
  const meta = AGENT_META[agent] ?? AGENT_META.coach;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none",
        meta.tone,
      )}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
