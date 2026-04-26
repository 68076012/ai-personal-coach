// Server-side helper: read the language cookie inside RSCs / server actions.
// Falls back to DEFAULT_LANG when the cookie is missing or invalid. Set the
// cookie via the language-toggle UI (later) or directly with cookies().set.

import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from "./index";

export async function getLang(): Promise<Lang> {
  const c = await cookies();
  const raw = c.get(LANG_COOKIE)?.value;
  return isLang(raw) ? raw : DEFAULT_LANG;
}

export async function setLang(lang: Lang) {
  const c = await cookies();
  c.set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
