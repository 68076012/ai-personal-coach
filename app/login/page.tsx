import { Suspense } from "react";
import { LoginPicker } from "@/components/auth/login-picker";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Coach</h1>
          <p className="text-sm text-muted-foreground">
            เลือกชื่อของคุณเพื่อเริ่ม
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginPicker />
        </Suspense>
      </div>
    </main>
  );
}
