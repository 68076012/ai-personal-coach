// Optional LINE Messaging API push (replaces deprecated LINE Notify).
// To use: create a LINE Bot at developers.line.biz, get the channel access token,
// have each user friend the bot, and capture their userId via webhook.

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export async function pushLineMessage(toUserId: string, text: string): Promise<{ ok: boolean; status?: number }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !toUserId) return { ok: false };
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: toUserId,
        messages: [{ type: "text", text: text.slice(0, 4900) }],
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

export function lineUserIdFor(coachUserId: string): string | null {
  if (coachUserId === "garfield") return process.env.LINE_USER_ID_GARFIELD ?? null;
  if (coachUserId === "partner") return process.env.LINE_USER_ID_PARTNER ?? null;
  return null;
}
