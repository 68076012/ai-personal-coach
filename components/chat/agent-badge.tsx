import { Dumbbell, Apple, ChefHat, FileText, Sparkles } from "lucide-react";

const AGENT_META = {
  trainer: { label: "Trainer", icon: Dumbbell, color: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  nutritionist: { label: "Nutritionist", icon: Apple, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  meal_designer: { label: "Chef", icon: ChefHat, color: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  reporter: { label: "Reporter", icon: FileText, color: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  orchestrator: { label: "Coach", icon: Sparkles, color: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
} as const;

export type AgentKey = keyof typeof AGENT_META;

export function AgentBadge({ agent }: { agent: AgentKey }) {
  const meta = AGENT_META[agent] ?? AGENT_META.orchestrator;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}
