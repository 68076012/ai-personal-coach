# AI Personal Fitness Coach

Web-based multi-agent AI fitness coach for 2 hardcoded users. Built per `PLAN.md`.

- **Stack**: Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Radix Nova) · Drizzle · Postgres (Supabase) · Gemini 2.5 (`@google/genai`) · iron-session · Recharts.
- **Cost target**: $0/mo using Vercel Hobby + Supabase free + Gemini free tier with smart routing + fallback chain.

## Quick start

```bash
pnpm install
cp .env.local.example .env.local
# fill in DATABASE_URL, AUTH_SECRET (>= 32 chars), GARFIELD_PASSCODE, PARTNER_PASSCODE,
# CRON_SECRET, GOOGLE_API_KEY (from aistudio.google.com)
pnpm db:push        # apply schema to Supabase
pnpm db:seed        # seed Garfield + Partner placeholders
pnpm dev
```

Open http://localhost:3000 → pick user → enter passcode → dashboard.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate SQL migration from `lib/db/schema.ts` |
| `pnpm db:push` | Apply schema directly to the DB (dev) |
| `pnpm db:studio` | Drizzle Studio web UI |
| `pnpm db:seed` | Insert/update the two seed users |

## Architecture

- `lib/db/` — Drizzle schema, client, queries, seed
- `lib/llm/` — Gemini client (with Pro→Flash→Flash-Lite fallback), tool runtime, agent orchestration, prompts
  - `client.ts` — `callGemini()` with daily caps, fallback, telemetry to `llm_calls`
  - `tools.ts` — function declarations + handlers (log_meal, log_workout, update_plan, update_memory, get_history, get_plan, propose_meals)
  - `runtime.ts` — `runAgent()` builds prompt context, runs tool-call loop, persists conversation
  - `orchestrator.ts` — regex fast-path then Flash-Lite intent router
  - `reporter.ts` — morning report (Pro)
  - `prompts.ts` — common header + per-agent system prompts (Thai)
- `lib/auth.ts` — iron-session helper
- `proxy.ts` — Next 16 proxy (formerly middleware) — protects `/dashboard/*`
- `app/(app)/dashboard/` — protected pages (today, chat, plan, progress, settings, admin)
- `app/api/chat` — main chat endpoint; routes via orchestrator
- `app/api/cron/morning-report` — 07:00 ICT, Reporter agent
- `app/api/cron/nightly-plan` — 21:00 ICT, Meal Designer + Trainer plan tomorrow
- `vercel.json` — cron schedule

## Deploy to Vercel

```bash
gh repo create ai-personal-coach --private --source=. --push
pnpm i -g vercel && vercel link
# Set env vars (DATABASE_URL, GOOGLE_API_KEY, AUTH_SECRET, *_PASSCODE, CRON_SECRET, etc.)
vercel env add DATABASE_URL production
# … repeat for each
vercel --prod
```

Vercel cron will call `/api/cron/*` with `Authorization: Bearer ${CRON_SECRET}`.

## Notification

LINE Notify was deprecated 2025-03-31. The app supports the LINE Messaging API instead — see `lib/line.ts` and the `LINE_*` env vars. Skip if you don't want notifications; cron still writes to `morning_reports` and the dashboard surfaces it.
