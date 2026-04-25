export function verifyCronAuth(req: Request): { ok: boolean; reason?: string } {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, reason: "missing_cron_secret" };
  const got = req.headers.get("authorization") ?? "";
  if (got === `Bearer ${expected}`) return { ok: true };
  return { ok: false, reason: "bad_auth" };
}
