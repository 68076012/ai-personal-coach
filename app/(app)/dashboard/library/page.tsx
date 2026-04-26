import Link from "next/link";
import { Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { listMealLibrary } from "@/lib/db/queries";
import { AppBar } from "@/components/hifi";
import { MealLibraryList } from "@/components/dashboard/meal-library-list";
import { getLang } from "@/lib/i18n/server";
import type { UserId } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function MealLibraryPage() {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;

  const [entries, lang] = await Promise.all([
    listMealLibrary(userId, 100).catch(() => []),
    getLang(),
  ]);

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
      <div className="mx-auto w-full max-w-3xl px-4 pb-8">
        <MealLibraryList entries={entries} lang={lang} />
      </div>
    </>
  );
}
