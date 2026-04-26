"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Minus, Plus, TrendingUp } from "lucide-react";
import { BottomSheet, HiFiButton } from "@/components/hifi";
import { quickLogWeight } from "@/app/(app)/dashboard/actions";
import { type Lang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STEP = 0.1;
const STEP_BIG = 1;

export function LogWeightSheet({
  open,
  onOpenChange,
  lang,
  initialWeight,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  initialWeight: number | null;
}) {
  const [weight, setWeight] = React.useState<number>(initialWeight ?? 70);
  const [pending, startTransition] = useTransition();

  React.useEffect(() => {
    if (open && initialWeight !== null) setWeight(initialWeight);
  }, [open, initialWeight]);

  function adjust(delta: number) {
    setWeight((w) => Math.max(20, Math.min(400, +(w + delta).toFixed(1))));
  }

  function submit() {
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error(lang === "th" ? "น้ำหนักไม่ถูกต้อง" : "Invalid weight");
      return;
    }
    startTransition(async () => {
      try {
        await quickLogWeight({ weight_kg: weight });
        toast.success(
          lang === "th" ? `บันทึก ${weight} kg แล้ว` : `Logged ${weight} kg`,
        );
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "log failed");
      }
    });
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("log_weight", lang)}
      description={
        lang === "th"
          ? "ชั่งวันนี้แล้วบันทึก — ค่าใหม่จะ override ของวันนี้"
          : "Today's reading — overwrites the morning's value if you re-weigh"
      }
      footer={
        <>
          <HiFiButton variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            {lang === "th" ? "ยกเลิก" : "Cancel"}
          </HiFiButton>
          <HiFiButton variant="primary" size="sm" onClick={submit} disabled={pending}>
            {pending ? "…" : t("save", lang)}
          </HiFiButton>
        </>
      }
    >
      <div className="flex flex-col items-center py-4 space-y-5">
        <TrendingUp className="size-7 text-[var(--sky)]" />

        <div className="flex items-center gap-3">
          <Stepper onClick={() => adjust(-STEP_BIG)} icon={<Minus className="size-4" />} big />
          <Stepper onClick={() => adjust(-STEP)} icon={<Minus className="size-3.5" />} />
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weight}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setWeight(n);
            }}
            className={cn(
              "w-32 text-center text-4xl font-bold tabular tracking-[-0.04em] text-[var(--ink)]",
              "bg-transparent outline-none border-b-2 border-[var(--accent)] py-1",
            )}
          />
          <Stepper onClick={() => adjust(STEP)} icon={<Plus className="size-3.5" />} />
          <Stepper onClick={() => adjust(STEP_BIG)} icon={<Plus className="size-4" />} big />
        </div>

        <div className="text-xs text-[var(--ink-3)]">kg</div>

        {initialWeight !== null && (
          <div className="text-[11px] text-[var(--ink-3)] text-center">
            {lang === "th" ? "ค่าล่าสุด" : "Last"}{": "}
            <span className="tabular text-[var(--ink-2)] font-medium">{initialWeight} kg</span>
            {weight !== initialWeight && (
              <span
                className={cn(
                  "ml-1 tabular font-medium",
                  weight > initialWeight ? "text-[var(--coral)]" : "text-[var(--leaf)]",
                )}
              >
                ({weight > initialWeight ? "+" : ""}
                {(weight - initialWeight).toFixed(1)})
              </span>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function Stepper({
  onClick,
  icon,
  big,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full inline-flex items-center justify-center text-[var(--ink-2)] transition-transform active:scale-95",
        big
          ? "size-9 bg-[var(--surface-2)]"
          : "size-7 bg-[var(--surface)] border border-[var(--line)]",
      )}
    >
      {icon}
    </button>
  );
}
