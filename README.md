# Coach — AI Personal Fitness

A bilingual (Thai-first / English) **AI fitness coach** for **two hardcoded users** (Garfield + Mai). Chat in Thai or English, log meals/workouts/weight naturally, get a daily morning briefing, follow a 7-day rolling plan, and let the coach adjust anything — workouts, meals, profile — through chat with explicit Apply/Reject for every plan write.

Built for $0/mo using Vercel Hobby + Supabase free + Gemini free tier with smart fallback routing through **Kimi K2.6** (Moonshot) when Gemini's daily quota is hit.

## What it does

- **Chat-first.** Type *"กินข้าวเที่ยงผัดไทย 1 จาน"* — Nutritionist estimates 710 kcal / P20 / C90 / F30, persists it, tells you the remaining macro budget. Type *"Squat 80kg 5x5 RPE 8"* — Trainer logs it. Type *"คืนนี้ติดประชุม"* — Trainer stores the constraint and proposes a rescheduled plan you can Apply right inside the chat bubble.
- **One unified coach.** Every chat message goes through a single Coach ✨ agent that has every tool (logging, planning, memory, profile, history). Cron-only specialists (Trainer 💪, Meal Designer 🍽, Reporter 📊) compose tomorrow's plan + the morning summary in the background.
- **Approval-gated plan writes.** Every plan creation goes through `propose_plan_bulk` → pending row → user taps **Apply** in chat (or on `/dashboard/plan`). Single-day or 31-day, same flow. No silent overwrites of today's plan.
- **Persistent memory + library.** Long-term constraints (injuries, allergies, pantry, sport focus, monthly goals) live in `agent_memory` and surface on every prompt. Saved meals live in `meal_library` and surface to the agent for re-use; the dashboard's *"Repeat yesterday's lunch"* tile is one-tap re-log.
- **Daily morning report + nightly plan.** Vercel cron at 07:00 ICT generates a Kimi-K2.6 coaching summary; 21:00 ICT pre-plans tomorrow's meals and workout, prunes expired memory, archives 30-day-old conversations into weekly summaries.
- **Mobile-first redesign (Hi-Fi).** Warm-paper palette, per-user accent (coral for Garfield / teal for Mai), bottom tab bar (Home / Plan / Chat / Progress / Library), inline tool-call cards, full-screen Morning Report takeover, BottomSheet quick-logs.
- **Bilingual.** Every UI string flows through `t(key, lang)`; toggle in Settings flips TH ↔ EN.
- **Single-provider runtime.** Every LLM call lands on Moonshot Kimi K2.6 (reasoning) via the `openai` SDK. Transient 5xx/overload triggers a single retry; otherwise the route surfaces the error verbatim to the user.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Radix) · Drizzle ORM · Postgres (Supabase) · `openai` SDK (Moonshot Kimi K2.6) · iron-session · Recharts · sonner · pnpm.

```
lib/llm/
  client.ts         # Single Kimi entry point with retry-once on transient errors, telemetry, LLMChainError taxonomy
  kimi.ts           # Moonshot OpenAI-compatible adapter (translates Gemini-style contents/tools ↔ OpenAI messages/tools)
  models.ts         # AgentName + ModelTier definitions; chooseModel() default (currently always "kimi")
  runtime.ts        # tool-call loop for any agent (coach for chat, trainer/meal_designer/reporter for cron); persists conversations and emits onPhase progress
  reporter.ts       # morning summary; rebalance-on-miss + monthly goal surfacing
  archive.ts        # nightly conversation archival (>30d → weekly summary in agent_memory)
  sanitize.ts       # strips tool_code / thought blocks the model sometimes emits as text
  tools.ts          # 14 tools: log_meal/workout, propose_plan_bulk, save_meal, find_saved_meal,
                    #   delete_log_entry, get_history, get_history_summary, search_memory,
                    #   update_memory, update_profile, update_plan, propose_meals, get_plan
  prompts.ts        # Thai system prompts (COACH_PROMPT for chat, plus cron-only TRAINER/MEAL_DESIGNER/REPORTER) + commonHeader

lib/db/
  schema.ts         # users, meals, workouts, daily_logs, daily_plans (with completion jsonb),
                    #   agent_memory, conversations, meal_library, pending_plans, morning_reports, llm_calls
  queries.ts        # ~40 query helpers; includes archival, summary, completion toggle, couple snapshot
  client.ts         # Drizzle + postgres-js with global pool

lib/i18n/
  copy.ts           # bilingual COPY table (~100 keys × 2 langs)
  index.ts          # t<K>(key, lang) typed lookup
  server.ts         # cookie-driven getLang() for RSCs

components/
  hifi/             # mobile redesign primitives — Card, Chip, Bar, BigNum, AppBar, TabBar (5 tabs),
                    #   Shell layout wrapper, BottomSheet, Button, LangToggle, ThemeToggle
  dashboard/        # HiFiDashboard, LogMealSheet, LogWeightSheet, PendingPlanBanner, PlanEditor,
                    #   PlanRangeView, AccountControls, DangerZone, MorningTakeover
  chat/             # HiFiChatPanel, HiFiAgentBadge (with emoji), HiFiToolCard (inline Apply/Reject)
  auth/             # HiFiLoginCards (two tinted user cards)
  progress/         # WeightChart, KcalChart, WorkoutVolumeChart, RangePicker

app/(app)/dashboard/
  page.tsx          # Today: hero kcal ring, repeat-yesterday strip, quick-log tiles, today plan,
                    #   recent logs (with HH:mm + X-to-delete + 5s undo), inline morning report
  chat/             # full-screen chat — single coach agent, SSE streaming with phase + heartbeat
  plan/             # Today / Week / Month tabs, pending banner, per-row done checkboxes, delete-plan
  progress/         # weight + kcal + volume charts, 7d/30d/90d range picker
  library/          # meal library list with filter chips + 1-tap "Use" → log_meal
  couple/           # vs. comparison: kcal today, weight, shared training week (7-col, ★ when both trained)
  morning/          # full-screen 4-slide story takeover (Hello → Recap → Streak → Today)
  settings/         # consolidated "เกี่ยวกับ {name}" card + language + theme + sign out + danger zone
  admin/            # daily Kimi usage stats, agent registry, DB row counts

app/api/
  chat/             # main endpoint; SSE stream → single runAgent("coach") → tool-call loop
  cron/morning-report/  # 07:00 ICT — Pro-tier summary, optional LINE push, missed-workout rebalance
  cron/nightly-plan/    # 21:00 ICT — pre-plan tomorrow + prune expired memory + archive convos

proxy.ts            # Next 16 proxy — protects /dashboard/*
```

## Get started

You'll need: Node 22+, pnpm, a Supabase project, and a Moonshot API key (Kimi K2.6 powers every LLM call).

```bash
pnpm install
cp .env.local.example .env.local
```

Fill `.env.local`:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port 6543). URL-encode any `@:/#?&%` in the password. |
| `MOONSHOT_API_KEY` | [platform.moonshot.ai](https://platform.moonshot.ai) — required. The app uses Kimi K2.6 (reasoning) for every LLM call. |
| `MOONSHOT_MODEL` | (optional) override the K2.6 model id; default `kimi-k2.6` |
| `MOONSHOT_BASE_URL` | (optional) `https://api.moonshot.cn/v1` for the China endpoint |
| `AUTH_SECRET` | Any 32+ char hex (`openssl rand -hex 32`) |
| `CRON_SECRET` | Any random hex string |

Then:

```bash
pnpm db:push                            # apply schema directly (interactive)
# OR for committed migrations:
pnpm exec drizzle-kit migrate
pnpm db:seed                            # insert/update Garfield + Mai user rows
pnpm dev                                # http://localhost:3000
```

Pick **Garfield** or **Mai**, and start chatting.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate SQL migration from `lib/db/schema.ts` |
| `pnpm db:push` | Apply schema directly (interactive) |
| `pnpm exec drizzle-kit migrate` | Apply committed migration (non-interactive) |
| `pnpm db:studio` | Drizzle Studio web UI |
| `pnpm db:seed` | Insert/update the two seed users |

## Deploy to Vercel

```bash
pnpm i -g vercel
vercel link
vercel env add DATABASE_URL production
vercel env add MOONSHOT_API_KEY production
vercel env add AUTH_SECRET production
vercel env add CRON_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add TZ production                   # Asia/Bangkok
vercel --prod
```

Vercel cron auto-fires `/api/cron/morning-report` (07:00 ICT) and `/api/cron/nightly-plan` (21:00 ICT) using `CRON_SECRET` as the bearer token.

## Cost guardrails

`lib/llm/models.ts` caps daily calls per tier:
- **Gemini Pro:** 90 (free tier ~100 RPD)
- **Gemini Flash:** 230 (free tier ~250)
- **Gemini Flash-Lite:** 950 (free tier ~1000)
- **Kimi K2.6:** 30 (paid; conservative — at ~$0.0006/call, worst-case ~$0.55/month)

When a tier 429s, errors out with 503/502/500, or hits its in-memory cap, the request falls through to the next tier. The last tier (Kimi) gets one retry-after-backoff for transient overload before giving up. `/dashboard/admin` shows today's call counts + cap percentage with a Bar primitive that turns coral as you approach exhaustion.

`/api/chat` returns typed errors (`gemini_quota` / `kimi_overload` / `all_failed`) with a `details` array per attempt, so the user-facing message is honest about the cause (e.g. *"Kimi กำลังแน่น — ลองอีกที 30 วิ"* vs *"Gemini quota หมดวันนี้"*).

## Notification (optional)

LINE Notify was deprecated 2025-03-31. Wire up a LINE Messaging API channel and set `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID_GARFIELD`, `LINE_USER_ID_PARTNER` if you want morning report push. Skip it and the report still shows on `/dashboard` and the full takeover at `/dashboard/morning`.

## See also

- `RELEASES.md` — chronological release notes for every PR / batch shipped
- `PLAN.md` — original implementation spec (some sections superseded by the redesign)
- `design_handoff_ai_personal_coach/` — Hi-Fi mockup spec for the mobile redesign (recreated, not used as code)
