"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleWorkoutPause } from "@/app/(app)/dashboard/plan/actions";

export function PauseWorkoutToggle({
  date,
  paused,
}: {
  date: string;
  paused: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        const next = !paused;
        await toggleWorkoutPause({ date, paused: next });
        toast.success(
          next
            ? "หยุด workout วันนี้แล้ว — โค้ชจะไม่ pingวันนี้"
            : "กลับมาออกกำลังกายต่อแล้ว 💪",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "ทำไม่สำเร็จ");
      }
    });
  }

  return (
    <Button
      type="button"
      variant={paused ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="text-xs"
    >
      {paused ? (
        <>
          <PlayCircle className="size-3.5" /> กลับมาทำต่อ
        </>
      ) : (
        <>
          <PauseCircle className="size-3.5" /> หยุดวันนี้
        </>
      )}
    </Button>
  );
}
