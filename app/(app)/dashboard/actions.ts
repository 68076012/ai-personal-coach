"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { deleteMealById, deleteWorkoutById } from "@/lib/db/queries";
import type { UserId } from "@/lib/db/schema";

const DeleteEntryInput = z.object({
  table: z.enum(["meals", "workouts"]),
  id: z.string().uuid(),
});

// User-driven delete from the dashboard "Recent" list. Same write path
// the LLM uses via delete_log_entry, but addressable from a UI X button
// without going through chat.
export async function deleteLogEntry(input: z.infer<typeof DeleteEntryInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = DeleteEntryInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  const userId = session.userId as UserId;
  const row =
    parsed.data.table === "meals"
      ? await deleteMealById(userId, parsed.data.id)
      : await deleteWorkoutById(userId, parsed.data.id);
  if (!row) throw new Error("not_found");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/progress");
  return { ok: true };
}
