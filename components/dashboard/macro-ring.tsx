interface Props {
  label: string;
  value: number;
  goal: number | null | undefined;
  unit: string;
  size?: number;
  accent?: "kcal" | "protein" | "carb" | "fat";
}

const ACCENTS = {
  kcal: "stroke-orange-500",
  protein: "stroke-emerald-500",
  carb: "stroke-amber-500",
  fat: "stroke-rose-500",
};

export function MacroRing({ label, value, goal, unit, size = 80, accent = "kcal" }: Props) {
  const pct = goal && goal > 0 ? Math.min(1, value / goal) : 0;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);
  const color = ACCENTS[accent];
  const over = goal && value > goal;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="stroke-muted fill-none"
            strokeWidth={6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className={`${color} fill-none transition-all`}
            strokeWidth={6}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-semibold tabular-nums ${over ? "text-rose-600" : ""}`}>
            {Math.round(value)}
          </span>
          {goal ? (
            <span className="text-[10px] text-muted-foreground tabular-nums">/{goal}</span>
          ) : null}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {label} {unit}
      </div>
    </div>
  );
}
