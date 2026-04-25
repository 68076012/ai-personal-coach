import { getSession } from "@/lib/auth";
import { getUser } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const rows: { label: string; value: string | number | null | undefined }[] = [
    { label: "ชื่อ", value: user.name },
    { label: "เพศ / อายุ", value: `${user.sex} / ${user.age}` },
    { label: "สูง", value: `${user.height_cm} cm` },
    { label: "น้ำหนักปัจจุบัน", value: user.current_weight_kg ? `${user.current_weight_kg} kg` : "-" },
    { label: "เป้าหมาย", value: user.goal },
    { label: "Activity level", value: user.activity_level ?? "-" },
    { label: "เป้า kcal/วัน", value: user.goal_kcal ?? "-" },
    { label: "เป้า P/C/F (g)", value: `${user.goal_protein_g ?? "-"} / ${user.goal_carb_g ?? "-"} / ${user.goal_fat_g ?? "-"}` },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground">
          ตอนนี้แก้ค่าผ่าน Supabase ได้โดยตรง — UI editor จะมาเฟส 8
        </p>
      </header>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">โปรไฟล์</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-3 gap-2 py-2">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="col-span-2 font-medium">{r.value ?? "-"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}
