import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import { listMealLibrary } from "@/lib/db/queries";
import { AppBar, HiFiCard, HiFiButton } from "@/components/hifi";
import { MealLibraryList } from "@/components/dashboard/meal-library-list";
import { getLang } from "@/lib/i18n/server";
import type { UserId } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const TZ = "Asia/Bangkok";

const GENERATE_DRAFT =
  "ช่วยเสนอเมนูใหม่ๆ 3 อย่างลงใน library — ใส่วัตถุดิบ + วิธีทำ ขั้นตอนกระชับ. เน้นวัตถุดิบที่หาง่ายในครัวไทย และตรงเป้า kcal/macros ของผม. เรียก save_meal เก็บแต่ละเมนูเข้า library เลย";

export default async function MealLibraryPage() {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;

  const [entries, lang] = await Promise.all([
    listMealLibrary(userId, 100).catch(() => []),
    getLang(),
  ]);

  const hourBkk = parseInt(formatInTimeZone(new Date(), TZ, "H"), 10);

  return (
    <>
      <AppBar
        eyebrow={lang === "th" ? "เมนูที่บันทึกไว้" : "Saved meals"}
        title={lang === "th" ? "Meal library" : "Meal library"}
        right={
          <Link
            href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยบันทึกเมนูใหม่เก็บไว้ใน library")}`}
            className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--accent)] text-white"
            aria-label={lang === "th" ? "เพิ่มเมนู" : "Add meal"}
          >
            <Plus className="size-5" />
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-3xl px-4 pb-8 space-y-4">
        {/* Coach-generate CTA — links to chat with a prefilled draft that
            instructs meal_designer to call save_meal multiple times with
            ingredients + recipe populated. Solves the "I don't know what to
            cook tonight" problem without leaving the app. */}
        <HiFiCard className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
            <div className="text-sm">
              <p className="font-medium text-[var(--ink)]">
                {lang === "th" ? "คิดไม่ออกว่าจะกินอะไร?" : "Stuck for ideas?"}
              </p>
              <p className="text-[var(--ink-3)] text-xs">
                {lang === "th"
                  ? "ให้โค้ชเสนอเมนูใหม่ — มาพร้อมวัตถุดิบและวิธีทำ"
                  : "Have the coach suggest new meals — ingredients + recipe included"}
              </p>
            </div>
          </div>
          <HiFiButton size="sm" asChild>
            <Link href={`/dashboard/chat?draft=${encodeURIComponent(GENERATE_DRAFT)}`}>
              <Sparkles className="size-4" />
              {lang === "th" ? "คิดเมนูใหม่" : "Generate"}
            </Link>
          </HiFiButton>
        </HiFiCard>

        <MealLibraryList entries={entries} lang={lang} hourBkk={hourBkk} />
      </div>
    </>
  );
}
