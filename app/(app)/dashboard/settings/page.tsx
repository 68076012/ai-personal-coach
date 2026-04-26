import { getSession } from "@/lib/auth";
import { getUser } from "@/lib/db/queries";
import { GoalEditor } from "@/components/dashboard/goal-editor";
import type { UserId } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await getUser(session.userId as UserId).catch(() => null);

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <p className="text-sm text-muted-foreground">
          ยังโหลดข้อมูลไม่ได้ — เช็ค DATABASE_URL
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">
          ทุกอย่างที่ใส่ไว้ โค้ชจะเห็นและใช้ในการวางแผน — แก้ได้ตลอดเวลา หรือบอกในแชทก็ได้
        </p>
      </header>
      <GoalEditor user={user} />
    </main>
  );
}
