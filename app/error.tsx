"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">เกิดข้อผิดพลาด</h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "ลองใหม่อีกครั้ง"}
        </p>
        <Button onClick={reset}>ลองใหม่</Button>
      </div>
    </main>
  );
}
