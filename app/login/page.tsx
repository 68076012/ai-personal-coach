import { Suspense } from "react";
import { HiFiLoginCards } from "@/components/auth/hifi-login-cards";

// Login lives outside (app) so it doesn't have the HiFiShell wrapper. We
// set data-design="hifi" directly so the warm-paper tokens apply, and
// drive the per-card accent via the data-accent attribute on each button
// itself (so coral and teal can coexist on this single screen).
export default function LoginPage() {
  return (
    <main
      data-design="hifi"
      className="flex flex-1 items-center justify-center px-6 pt-12 pb-10 bg-[var(--bg)] min-h-screen"
    >
      <div className="w-full max-w-sm space-y-10">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-[var(--ink)]">
            Coach
          </h1>
          <p className="text-sm text-[var(--ink-3)]">
            เลือกชื่อของคุณเพื่อเริ่ม
          </p>
        </div>
        <Suspense fallback={null}>
          <HiFiLoginCards />
        </Suspense>
      </div>
    </main>
  );
}
