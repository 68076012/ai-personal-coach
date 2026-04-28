import { callLLM } from "./client";
import {
  deleteConversationsForWeek,
  getArchivableConversationWeeks,
  getConversationsForWeek,
  upsertAgentMemory,
} from "@/lib/db/queries";
import type { UserId } from "@/lib/db/schema";

const SYSTEM = `คุณคือ archivist สรุป conversation ระหว่าง user กับ AI fitness coach เก็บไว้ใน long-term memory.
ทำเป็นภาษาไทย กระชับ <= 180 คำ. โฟกัสเฉพาะข้อมูลที่ agent อนาคตควรจำได้ — เช่น:
- เป้าหมายที่ตั้ง / เปลี่ยน
- อาการบาดเจ็บ / ข้อจำกัด
- เมนูโปรด / ของแพ้
- patterns ของพฤติกรรม (เช่น "เริ่มออกหนักทุกอังคาร")
- การปรับ plan สำคัญ
ห้ามใส่ข้อความ pleasantries (ทักทาย, ขอบคุณ). ห้ามอ้าง datetime เฉพาะ. สรุปเป็น bullet หรือย่อหน้าสั้น.`;

interface ArchiveResult {
  user_id: UserId;
  year: number;
  week: number;
  archived_turns: number;
  summary_chars: number;
}

// One-pass archival run. Suitable for the nightly cron. Caps at maxWeeks to
// keep API spend bounded — if there's a backlog, future runs will catch up.
export async function runConversationArchival(opts: {
  cutoffDate: Date;
  maxWeeks?: number;
}): Promise<{ archived: ArchiveResult[]; skipped: number; errors: number }> {
  const buckets = await getArchivableConversationWeeks(opts.cutoffDate);
  const max = opts.maxWeeks ?? 8;
  const targets = buckets.slice(0, max);

  let errors = 0;
  let skipped = 0;
  const archived: ArchiveResult[] = [];

  for (const bucket of targets) {
    if (bucket.count < 3) {
      // Low-signal week (few turns) — just delete, no summary worth keeping.
      try {
        await deleteConversationsForWeek(
          bucket.user_id as UserId,
          bucket.year,
          bucket.week,
        );
        skipped++;
      } catch {
        errors++;
      }
      continue;
    }

    try {
      const rows = await getConversationsForWeek(
        bucket.user_id as UserId,
        bucket.year,
        bucket.week,
      );
      const transcript = rows
        .filter((r) => r.role === "user" || r.role === "assistant")
        .map((r) => `[${r.role === "user" ? "USER" : "COACH"}] ${r.content}`)
        .join("\n")
        .slice(0, 12000); // cap input tokens so cost stays bounded

      const res = await callLLM({
        tier: "kimi-fast",
        systemInstruction: SYSTEM,
        contents: [{ role: "user", parts: [{ text: transcript }] }],
        agent: "reporter",
        userId: bucket.user_id,
      });
      const summary = (res.text ?? "").trim();
      if (!summary) {
        errors++;
        continue;
      }

      const isoWeekStr = String(bucket.week).padStart(2, "0");
      await upsertAgentMemory({
        user_id: bucket.user_id as UserId,
        agent_type: "shared",
        key: `conversation_summary_${bucket.year}_W${isoWeekStr}`,
        value: summary,
        // No TTL — we want long-term recall.
        expires_at: null,
      });

      const deleted = await deleteConversationsForWeek(
        bucket.user_id as UserId,
        bucket.year,
        bucket.week,
      );
      archived.push({
        user_id: bucket.user_id as UserId,
        year: bucket.year,
        week: bucket.week,
        archived_turns: deleted,
        summary_chars: summary.length,
      });
    } catch (err) {
      console.warn(
        `[archive] ${bucket.user_id} ${bucket.year}-W${bucket.week} failed:`,
        err,
      );
      errors++;
    }
  }

  return {
    archived,
    skipped,
    errors,
  };
}
