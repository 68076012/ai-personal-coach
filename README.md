# Coach — AI Personal Fitness

A web app that turns a Gemini API key into a personal **fitness coach + nutritionist + meal planner + morning briefing** for two people. Chat in Thai, log meals/workouts naturally, and the right specialist agent answers, persists, and asks coaching follow-ups.

Built for $0/mo using Vercel Hobby + Supabase free + Gemini free tier with smart fallback routing.

## What it does

- **Chat-first.** Type *"กินข้าวเที่ยงผัดไทย 1 จาน"* — Nutritionist estimates 710 kcal / P20 / C90 / F30, persists it, tells you the remaining macro budget for the day. Type *"Squat 80kg 5x5 RPE 8"* — Trainer logs it and asks if you felt it in the right muscle group. Type *"คืนนี้ติดประชุม ออกกำลังกายไม่ได้"* — Trainer stores the constraint, suggests rescheduling.
- **Multi-agent.** An Orchestrator (Gemini Flash-Lite + regex fast-path) routes each message to one of four specialists: Trainer, Nutritionist, Meal Designer, Reporter. Each has its own Thai system prompt and toolset.
- **Persistent memory.** Long-term constraints (injuries, preferences, kitchen contents) live in `agent_memory` and are injected into every prompt.
- **Daily morning report.** A Vercel cron at 07:00 ICT runs the Reporter agent (Gemini Pro) which compares yesterday's logs against your goal and surfaces specific coaching questions on the dashboard.
- **Nightly planner.** Another cron at 21:00 ICT has Meal Designer + Trainer pre-plan tomorrow's meals and workout.
- **Progress charts.** Weight line, daily kcal vs goal bars, workout volume, streak counter.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Radix Nova) · Drizzle ORM · Postgres (Supabase) · `@google/genai` (Gemini 2.5) · iron-session · Recharts · pnpm.

```
lib/llm/
  client.ts       # Pro→Flash→Flash-Lite fallback, daily caps, telemetry
  models.ts       # tier selection per task
  orchestrator.ts # regex fast-path + Flash-Lite intent router
  runtime.ts      # tool-call loop + conversation persistence
  reporter.ts     # morning summary (Pro)
  tools.ts        # log_meal, log_workout, update_plan, update_memory, …
  prompts.ts      # Thai system prompts per agent
lib/db/           # Drizzle schema + queries + seed
app/(app)/dashboard/
  page.tsx        # today: macros, plan, recent logs, morning report
  chat/           # full-screen chat
  plan/           # editable today + tomorrow plans
  progress/       # charts
  admin/          # Gemini quota + DB row counts
app/api/
  chat/           # main endpoint, routes via orchestrator
  cron/morning-report
  cron/nightly-plan
proxy.ts          # Next 16 proxy — protects /dashboard/*
```

## Get started

You'll need: Node 22+, pnpm, a Supabase project, a Gemini API key (free, from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).

```bash
pnpm install
cp .env.local.example .env.local
```

Fill `.env.local` with:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port 6543). URL-encode any `@:/#?&%` in the password. |
| `GOOGLE_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `AUTH_SECRET` | Any 32+ char hex (`openssl rand -hex 32`) |
| `GARFIELD_PASSCODE`, `PARTNER_PASSCODE` | Whatever you'll remember |
| `CRON_SECRET` | Any random hex string |

Then:

```bash
pnpm db:push      # apply schema (or: pnpm exec drizzle-kit migrate to use the committed migration)
pnpm db:seed      # insert the two user rows
pnpm dev          # http://localhost:3000
```

Pick **Garfield** or **Partner**, enter the passcode, and start chatting.

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
vercel link                      # follow prompts to create a project
# Add each .env.local value to Vercel:
vercel env add DATABASE_URL production
vercel env add GOOGLE_API_KEY production
vercel env add AUTH_SECRET production
vercel env add GARFIELD_PASSCODE production
vercel env add PARTNER_PASSCODE production
vercel env add CRON_SECRET production
vercel env add NEXT_PUBLIC_APP_URL production   # your *.vercel.app URL
vercel env add TZ production                    # Asia/Bangkok
vercel --prod
```

Vercel cron auto-fires `/api/cron/morning-report` (07:00 ICT) and `/api/cron/nightly-plan` (21:00 ICT) using `CRON_SECRET` as the bearer token.

## Cost guardrails

`lib/llm/models.ts` caps daily calls per tier (Pro 90, Flash 230, Flash-Lite 950) — when a tier 429s or hits its cap, requests fall through to the next tier. The `/dashboard/admin` page shows today's call counts per model and DB row counts, so you can see how much of the free budget you've burned.

## Notification (optional)

LINE Notify was deprecated 2025-03-31. Wire up a LINE Messaging API channel and set `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID_GARFIELD`, `LINE_USER_ID_PARTNER` if you want morning report push. Skip it and the report still shows on `/dashboard`.

## See also

`PLAN.md` is the original implementation spec — useful if you want to extend the system or build something similar.
