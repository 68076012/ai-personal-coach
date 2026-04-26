// Lightweight i18n. Two languages, ~95 keys, no plurals — a tiny t() that
// does typed lookups against the COPY table is enough. If we ever need
// formatting/plurals we'll swap in next-intl; for now this keeps the bundle
// ~zero and the API obvious.

import { COPY, type CopyKey } from "./copy";

export type Lang = keyof typeof COPY;
export const LANGS: readonly Lang[] = ["th", "en"] as const;
export const DEFAULT_LANG: Lang = "th";

export const LANG_COOKIE = "coach_lang";

export function isLang(value: unknown): value is Lang {
  return value === "th" || value === "en";
}

// Typed lookup: t("greeting_morning", "th") returns "อรุณสวัสดิ์".
// For array-valued keys (week, months, week_long), the return type is
// readonly string[] so callers can index it.
export function t<K extends CopyKey>(
  key: K,
  lang: Lang = DEFAULT_LANG,
): (typeof COPY)["th"][K] {
  // Both langs have identical key shape (string vs string vs readonly string[])
  // by construction in copy.ts, so this cast is safe and keeps callers
  // typed against the canonical TH variant.
  return COPY[lang][key] as (typeof COPY)["th"][K];
}

export { COPY, type CopyKey };
