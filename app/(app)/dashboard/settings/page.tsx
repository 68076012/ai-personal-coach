import { getSession } from "@/lib/auth";
import { getUser } from "@/lib/db/queries";
import { GoalEditor } from "@/components/dashboard/goal-editor";
import { DangerZone } from "@/components/dashboard/danger-zone";
import { AppBar, HiFiCard, LangToggle } from "@/components/hifi";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { UserId } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.userId) return null;
  const [user, lang] = await Promise.all([
    getUser(session.userId as UserId).catch(() => null),
    getLang(),
  ]);

  if (!user) {
    return (
      <>
        <AppBar title={t("settings", lang)} />
        <main className="px-4 py-6 text-sm text-[var(--ink-3)]">
          ยังโหลดข้อมูลไม่ได้ — เช็ค DATABASE_URL
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar
        eyebrow={lang === "th" ? "บัญชี" : "Account"}
        title={t("settings", lang)}
      />
      <div className="mx-auto w-full max-w-3xl px-4 pb-8 space-y-4">
        <p className="text-sm text-[var(--ink-3)]">
          {lang === "th"
            ? "ทุกอย่างที่ใส่ไว้ โค้ชจะเห็นและใช้ในการวางแผน — แก้ได้ตลอดเวลา หรือบอกในแชทก็ได้"
            : "Everything here is visible to the coach. Edit anytime — or just tell the coach in chat."}
        </p>

        {/* Language toggle */}
        <HiFiCard className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-semibold text-[var(--ink)]">
              {t("language", lang)}
            </div>
            <div className="text-xs text-[var(--ink-3)] mt-0.5">
              {lang === "th"
                ? "เปลี่ยนภาษาในแอป (ยังไม่ครอบคลุมทุกหน้า)"
                : "Switch app language (not all surfaces yet)"}
            </div>
          </div>
          <LangToggle current={lang} />
        </HiFiCard>

        <GoalEditor user={user} />
        <DangerZone userName={user.name} />
      </div>
    </>
  );
}
