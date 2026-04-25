import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, verifyPasscode } from "@/lib/auth";
import type { UserId } from "@/lib/db/schema";

const Body = z.object({
  userId: z.enum(["garfield", "partner"]),
  passcode: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
  }
  const { userId, passcode } = parsed.data;
  if (!verifyPasscode(userId as UserId, passcode)) {
    return NextResponse.json(
      { ok: false, error: "invalid_passcode" },
      { status: 401 },
    );
  }
  const session = await getSession();
  session.userId = userId as UserId;
  await session.save();
  return NextResponse.json({ ok: true, userId });
}
