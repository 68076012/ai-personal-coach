"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  MessageCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Lang, t } from "@/lib/i18n";

interface SlideData {
  kind: "hello" | "recap" | "streak" | "today";
  title: string;
  body?: React.ReactNode;
  metric?: { label: string; value: string; tone?: "leaf" | "sun" | "coral" | "sky" };
}

interface Props {
  lang: Lang;
  userName: string;
  slides: SlideData[];
}

// Full-screen story-style takeover. 4 slides, top progress bars, tap left/
// right to nav, 5s auto-advance, "Ask coach" exit. Mounted as the entire
// page body (the parent page sets the background).
export function MorningTakeover({ lang, userName, slides }: Props) {
  const router = useRouter();
  const [idx, setIdx] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      if (idx < slides.length - 1) setIdx(idx + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [idx, paused, slides.length]);

  function next() { setIdx((i) => Math.min(i + 1, slides.length - 1)); }
  function prev() { setIdx((i) => Math.max(i - 1, 0)); }
  function close() { router.push("/dashboard"); }
  function askCoach() { router.push("/dashboard/chat"); }

  const slide = slides[idx];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--accent)] text-white"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* Top progress bars */}
      <div
        className="flex gap-1 px-3 pt-2"
        style={{ paddingTop: "max(env(safe-area-inset-top), 8px)" }}
      >
        {slides.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
          >
            <div
              className={cn(
                "h-full bg-white",
                i < idx && "w-full",
                i === idx && !paused && "w-full",
                i === idx && paused && "w-1/2",
                i > idx && "w-0",
              )}
              style={{
                transition:
                  i === idx && !paused ? "width 5s linear" : "width 0.2s",
              }}
            />
          </div>
        ))}
      </div>

      {/* Top-right close */}
      <button
        onClick={close}
        aria-label={t("close", lang)}
        className="absolute top-2 right-2 size-9 rounded-full inline-flex items-center justify-center text-white/90 hover:bg-white/10"
        style={{ top: "max(env(safe-area-inset-top), 8px)" }}
      >
        <X className="size-5" />
      </button>

      {/* Tap zones for nav */}
      <button
        type="button"
        aria-label="prev"
        onClick={prev}
        className="absolute left-0 top-12 bottom-20 w-1/3 z-10"
      />
      <button
        type="button"
        aria-label="next"
        onClick={next}
        className="absolute right-0 top-12 bottom-20 w-1/3 z-10"
      />

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-8 pt-4 pb-12 relative z-0">
        {idx === 0 && (
          <div className="space-y-3 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
              {t("morning_report", lang)}
            </div>
            <h2 className="text-4xl font-bold tracking-[-0.03em]">
              {t("greeting_morning", lang)}, {userName}
            </h2>
            <p className="text-base opacity-90 mt-3">{slide.title}</p>
          </div>
        )}
        {idx > 0 && (
          <div className="space-y-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
              {slide.kind === "recap"
                ? t("yesterday_recap", lang)
                : slide.kind === "streak"
                  ? t("streak", lang)
                  : t("today_focus", lang)}
            </div>
            <h2 className="text-3xl font-bold tracking-[-0.02em] leading-tight">
              {slide.title}
            </h2>
            {slide.body && (
              <div className="text-base leading-relaxed opacity-95">
                {slide.body}
              </div>
            )}
            {slide.metric && (
              <div className="mt-6 inline-flex items-baseline gap-2 bg-white/15 rounded-2xl px-4 py-3">
                {slide.kind === "streak" && <Flame className="size-5" />}
                <span className="text-5xl font-bold tabular tracking-[-0.04em]">
                  {slide.metric.value}
                </span>
                <span className="text-sm opacity-80">{slide.metric.label}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom: prev/next chevrons + Ask coach exit */}
      <div
        className="flex items-center justify-between px-4 pb-3 relative z-10"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <button
          onClick={prev}
          disabled={idx === 0}
          className="size-10 rounded-full inline-flex items-center justify-center bg-white/15 disabled:opacity-30"
          aria-label="Previous"
        >
          <ChevronLeft className="size-5" />
        </button>
        {idx === slides.length - 1 ? (
          <button
            onClick={askCoach}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-white text-[var(--accent)] text-sm font-semibold shadow-[var(--sh-2)]"
          >
            <MessageCircle className="size-4" />
            {t("ask_coach", lang)}
          </button>
        ) : (
          <button
            onClick={next}
            className="inline-flex items-center gap-1 px-5 h-11 rounded-full bg-white/20 text-sm font-medium"
          >
            {lang === "th" ? "ต่อ" : "Next"}
          </button>
        )}
        <button
          onClick={next}
          disabled={idx === slides.length - 1}
          className="size-10 rounded-full inline-flex items-center justify-center bg-white/15 disabled:opacity-30"
          aria-label="Next"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
