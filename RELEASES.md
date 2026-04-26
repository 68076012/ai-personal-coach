# Release Notes

Chronological record of feature batches, fixes, and refactors. Grouped by date and PR cluster. Earliest first.

---

## 2026-04-25 — Foundation

### PR #1, #2 — Mobile-first scaffolding

- Mobile nav menu (hamburger Sheet drawer) on top bar
- Passwordless login picker (two-button user pick)
- Plan UX iteration (Today / Week / Month tabs in `/dashboard/plan`)
- Background goal fields on user profile (work hours, workout window, budget, pantry, dietary notes)
- Pause-workout toggle on plan rows
- Cron: morning-report and nightly-plan honor `workout_paused` for the day

---

## 2026-04-26 — Agent capability expansion

### PR #3 — `agents: add structured retrieval, meal library, draft plans, sports overlay`

**New tools (Phase A — agent retrieval):**
- `get_history_summary({type, days})` — pre-aggregated insights (macros daily + average, workouts per-exercise + daily volume, weight trend with 7d/30d delta). Replaces noisy raw `get_history` for "show me trends" queries.
- `search_memory({query})` — ILIKE substring search over `agent_memory.key + value`. Agents now verify constraints (e.g. *"เข่า"*, *"แพ้"*) before recommending.
- Nightly cron prunes expired `agent_memory` rows.

**Meal library:**
- New `meal_library` table (user_id, name, macros, ingredients, times_used, last_used_at)
- `save_meal` + `find_saved_meal` tools
- `log_meal` auto-bumps usage so the library self-organizes by frequency
- Meal Designer + Nutritionist consult library before proposing new dishes

**Bulk plans:**
- `update_plan_bulk` (later renamed `propose_plan_bulk`) tool writes 1-31 days atomically to a draft `pending_plans` table
- `<PendingPlanBanner>` component on `/dashboard/plan` with Approve / Reject server actions and day-by-day preview

**Sports focus:**
- New `users.sports_focus` column (e.g. *"badminton"*, *"yoga"*)
- Surfaces in `commonHeader`; Trainer prompt has sport-specific knowledge blocks (badminton footwork drills, volleyball jump training, yoga mobility, generic specificity rule)

**Week UX:**
- `PlanRangeView` shows per-day kcal estimate vs goal with color delta (green ±10%, red over, amber under)

**Monthly goals:** convention-based via `update_memory key='goal_month_YYYYMM_<slug>'`. Reporter loads matching keys and surfaces them in morning summaries.

**Rebalance-on-miss:** Reporter compares yesterday's planned workout vs logged workouts; if missed and not paused, surfaces a "shift to today / push tomorrow / skip" question.

**Admin:** read-only Agents card listing each agent's model tier, tools, and today's call count.

Migrations: `0002_elite_lila_cheney.sql` (meal_library + sports_focus), `0003_nasty_the_hand.sql` (pending_plans).

---

### PR #4, #5 — LLM resilience: 5xx fallback + Kimi K2.6

**PR #4 — Fall back on 503/502/500, not just 429**
- Gemini's "model overloaded" 503s previously bubbled up as a hard error. Now treated as transient: log cause, try the next tier.

**Kimi K2.6 (Moonshot) as paid last-resort fallback:**
- New `kimi` tier appended to every Gemini chain (Pro→Flash→Flash-Lite→Kimi)
- New `lib/llm/kimi.ts` translates Gemini's `Content[]` + `FunctionDeclaration[]` to OpenAI-compatible messages/tools (with deterministic `tool_call_id`s for `functionCall` ↔ `functionResponse` matching, and JSON-Schema type-field lowercasing)
- Capped at 30 calls/day to bound cost (~$0.55/month worst case)
- Configurable via `MOONSHOT_API_KEY`, `MOONSHOT_MODEL`, `MOONSHOT_BASE_URL` env

**PR #5 — `kimi: stop passing temperature`**
- Bug: Moonshot returned 400 *"invalid temperature: only 1 is allowed"* for K2.6 (reasoning-class model). We were sending 0.7. Fix: drop temperature from the Kimi `create()` call so Moonshot uses model-specific defaults.

---

### PR #6 — `settings + chat: combine into "เกี่ยวกับ {name}" card + add update_profile tool`

- Settings UI consolidated: previously two cards (เป้าหมาย + ข้อมูลพื้นฐาน), now one continuous "เกี่ยวกับ {user.name}" card.
- New `update_profile({field, value, reason?})` tool — agents update user profile fields from chat. Whitelisted fields with per-field zod validation. Two safety classes baked into the prompt:
  - **Additive** (pantry, dietary, sports_focus, work hours, workout window, budget) → write directly
  - **Destructive** (goal text, kcal targets, macros, weight, age, height, activity_level) → must restate in chat and wait for user *"ใช่"* before writing
- Audit trail: every change logs `agent_memory` under `profile_change_<field>_<ts>` (90-day TTL).

---

### PR #7 — `honest LLM chain errors + reset account + drop test user`

**Honest fallback errors:**
- New `LLMChainError` with kind `gemini_quota | kimi_overload | all_failed`
- Per-tier attempt log returned in `/api/chat` response `details` field
- Last-tier (Kimi) gets one retry-after-backoff on transient overload
- User-facing messages now distinguish "Gemini quota หมด" from "Kimi แน่น" from "ทุก provider ล่ม"

**Reset account:**
- New `<DangerZone>` card on Settings: type `RESET` to confirm → wipes meals/workouts/daily_logs/daily_plans/agent_memory/conversations/morning_reports/meal_library/pending_plans
- Keeps profile fields and `llm_calls` (for cost continuity)

**Drop legacy test user:**
- The cron jobs were running for `test` too — burning ~4-6 free-tier calls/day on a fake account
- Removed from `UserId`, `ALLOWED_USERS`, login enum, login-picker, line.ts mapping, seed
- Migration `0004_drop_test_user.sql` cleans the live DB

---

## 2026-04-26 — Mobile redesign (Hi-Fi)

### PR #8 — `hifi/phase 1-15: full mobile redesign`

A 15-phase redesign delivered as one branch with one commit per phase. All wrapped in `data-design="hifi"` scope so the original shadcn defaults coexisted during rollout.

**Phase 1 — tokens:** warm-paper neutrals (`--bg #faf7f1`, `--ink #1f1c17`, …), per-user accent (`--accent` driven by `data-accent="coral|teal"`), semantic tones (leaf/sun/sky/coral/teal), shadows, radii. Dark-mode flip via `.dark` class. Inter + IBM Plex Sans Thai already wired.

**Phase 2 — i18n:** `lib/i18n/copy.ts` with ~95 keys × 2 langs (TH + EN), `t<K>(key, lang)` typed helper, cookie-driven `getLang()` for RSCs.

**Phase 3 — primitives:** `HiFiCard`, `Chip` (7 tone variants), `Bar`, `BigNum`, `AppBar`, `TabBar` (5 bottom tabs, sticky safe-area-padded, accent active state), `HiFiShell` (layout wrapper that sets data-design + data-accent + data-lang), `BottomSheet` (warm-paper styled), `HiFiButton` (default/primary/soft/ghost × sm/md/lg/tile).

**Phase 4 — Dashboard:** AppBar with date eyebrow + greeting + accent avatar, hero kcal block (animated count-up `BigNum`, 200px SVG ring with strokeDasharray transition), quick-log tile grid, macros card with `Bar` primitives, today plan preview, recent logs.

**Phase 5 — Chat:** new `HiFiChatPanel` with agent emoji badges (💪🥗🍽📊✨), inline tool-call cards. The big one: `propose_plan_bulk` cards with Apply / Reject right in chat, expandable day-by-day preview reading `args.plans[]`. Smaller cards for `propose_meals` / `update_plan` / `save_meal`. Voice + camera placeholder buttons.

**Phase 6 — Plan:** AppBar wrap, restyled pending banner, hifi visual on Today/Week/Month tabs.

**Phase 7 — Progress:** three `HiFiCard`-wrapped charts (weight line, kcal vs goal bar, workout volume) + range picker (7d/30d/90d) via `?range=` search param + Couple-view link card.

**Phase 8 — Settings:** AppBar wrap + new language toggle.

**Phase 9 — Meal Library** (new screen): `/dashboard/library` with search, filter chips (All / B / L / D / S), per-row "Use" → server action that inserts a `meals` row at "now" and bumps library usage.

**Phase 10 — Couple** (new screen): `/dashboard/couple` versus card showing both users' kcal, weight, and shared training week (7-column grid with two dots per day, gradient bg + ★ when both trained).

**Phase 11 — Admin:** quota bars (color shift leaf→sun→coral as % of cap rises), agent registry, DB row counts.

**Phase 12 — Morning Report takeover:** `/dashboard/morning` — full-screen 4-slide story (Hello → Recap → Streak → Today) with top progress bars (5s auto-advance), tap-zone navigation, accent-tinted bg. Reachable from the inline morning card on dashboard.

**Phase 13 — Login:** two big tinted user cards (Garfield coral / Mai teal). Old shadcn LoginPicker deprecated.

**Phase 15 — Polish:** dashboard morning-card → takeover link wiring; legacy components left as dead code for safe rollback.

(Phase 14 — Onboarding wizard — explicitly skipped: only 2 hardcoded users, both have full profiles.)

---

### PR #9 — `goal-editor: flatten "เกี่ยวกับ {name}"`

Sub-section labels (`เป้าหมาย & ตัวเลข`, `ตัวฉัน`, `ไลฟ์สไตล์ & อาหาร`) and `<hr>` dividers between them visually fragmented the card into what looked like three separate cards. Removed both — now reads as one continuous form.

---

### PR #10 — `chat: pin composer to bottom + auto-scroll on first paint`

Two layout bugs from the chat redesign:

1. Composer floated mid-screen on empty state because `HiFiShell`'s `main` was `flex-1 overflow-y-auto` but **not** `flex-col`, so the chat panel's `flex-1` scroll area collapsed to its content height.
2. Arriving with a prefilled draft (from Plan / dashboard quick-log tiles) didn't scroll to bottom on first paint.

Fix: main → `flex-col`, scroll wrapper got `min-h-0`, initial-paint scroll uses `behavior:"auto"` via a `didMount` ref.

---

### PR #11 — `UX enhancements batch (E1-E5)`

| | What |
|---|---|
| **E1** | Bottom TabBar — Library replaces Settings (daily-used > rarely-used). Settings via avatar tap on Home. |
| **E2** | `AbortController` on chat fetch + Stop button on the pending bubble. Cancel any in-flight chat without 15s wait through Kimi fallback. |
| **E3** | `delete_log_entry({table, id})` LLM tool wired into Trainer + Nutritionist + per-row X button on dashboard Recent rows. New `deleteMealById` / `deleteWorkoutById` queries gate on user_id. |
| **E4** | `LogMealSheet` BottomSheet form on dashboard — skip the chat round-trip when macros are known. "Don't know macros" link drops into chat. |
| **E5** | Nightly cron archives conversations >30 days old. Bucketed by ISO week → Flash summary into `agent_memory` with key `conversation_summary_YYYY_Www` → delete originals. Bounded at 8 weeks/night. |

---

### PR #12 — `QoL batch (Q1-Q5)`

| | What |
|---|---|
| **Q1** | `LogWeightSheet` — stepper UI (±0.1 / ±1), upserts `daily_logs` by (user, date), bumps `users.current_weight_kg`. Diff line shows delta vs prior reading. |
| **Q2** | Undo toast on delete + `restoreLogEntry` server action. 5-second grace; tap Undo to restore the row with its original UUID. Replaces brittle `window.confirm`. |
| **Q3** | Theme toggle in Settings (light / dark / system) using `next-themes`. CSS was already wired; just needed UI. |
| **Q4** | Timestamps + undo wiring on dashboard Recent rows. `HH:mm` next to title; consumes Q2's undo flow. |
| **Q5** | Repeat-yesterday suggestion strip — only shows when there's a yesterday meal of the current-hour's meal_type AND today's slot isn't already logged. One-tap copy via new `repeatMealLog` server action. |

---

### PR #13 — `Switch account + Mark-as-done + Multi-agent dispatch fix (F1-F3)`

| | What |
|---|---|
| **F1** | Sign out + Switch account on Settings. The HiFi shell removed the legacy TopBar — there was no logout entry point in the new UI. New `<AccountControls>` card. |
| **F2** | Mark-as-done on plan items. New `daily_plans.completion` jsonb column (`{workout_done, meal_done}: number[]`). Optimistic UI; tap-to-check writes to the same column from both dashboard preview and (later) PlanEditor. |
| **F3** | **Multi-agent dispatch.** Compound prompts (*"workout + เมนูทั้งวัน"*) silently dropped one agent because orchestrator returned a single `agent`. Now returns an `agents` array; regex collects every match; `/api/chat` runs each in sequence; client renders each as a separate bubble with its own agent badge. |

Migration: `0005_low_leper_queen.sql` adds `daily_plans.completion`.

---

### PR #14 — `plan: per-row done checkboxes + tighten agent one-entry-per-item rule`

- Each `WorkoutRow` + `MealRow` in `PlanEditor` (the full edit surface on `/plan`) gets a leaf-green check button. Same `daily_plans.completion` column as F2 — checks sync across dashboard preview and full editor.
- Trainer + Meal Designer prompts now require **one entry per exercise/dish** in `workout_plan` / `meal_plan` arrays. Was sometimes collapsing a full session ("Squat / Bench / Pull-ups") into a single entry, leaving the user no way to tick individual items.

---

### PR #15 — `chat: per-agent failure resilience + always require plan approval`

- **Per-agent try/catch** in `/api/chat`. Previously: the outer try/catch meant a Kimi-429 on agent #2 destroyed agent #1's already-collected reply. Now: each agent has its own try block; successful replies always come through; failures recorded in a `partial_failures[]` array.
- `console.log('[/api/chat] dispatching to N agent(s): ...')` for log-based debugging in Vercel.
- **Always-approve** for plan creation: Trainer + Meal Designer prompts now use `propose_plan_bulk` for **any** plan creation, even single-day. `update_plan` / `propose_meals` reserved for explicit small tweaks. Eliminates silent overwrites of today's plan.

---

### PR #16 — `ux: today's focus shows all items + plan auto-scroll + chat dedup`

| | What |
|---|---|
| **U1** | PlanEditor auto-scrolls into view when `?date=` is set (tap a day card on the week/month strip → land on its editor). |
| **U2** | Dashboard Today's focus shows **all** plan items, not `slice(0,2)` meals + `slice(0,1)` workout. Workout meta line surfaces weight_kg + duration_min. |
| **U3** | Chat dedupes multi-agent user msg duplicates. `/api/chat` logs the user message under each agent's `agent_type` for per-agent context coherence; render-side fold collapses N consecutive identical user bubbles into one. Window = 6 hops. Bumped chat history fetch from 40 → 100 (archival cron keeps the table bounded). |

---

### PR #17 — `plan/chat: refresh-after-approve + readonly dashboard mirror + delete-plan + tool_code sanitizer`

| | What |
|---|---|
| **V1** | `router.refresh()` after Approve/Reject in both PendingPlanBanner and inline chat tool card. Server action revalidatePath wasn't enough — client router served cached RSC. |
| **V2** | Dashboard Today's focus = read-only mirror. Plan page is the single editing surface for ticking items off. Same `daily_plans.completion` column. |
| **V3** | "ลบแผน" trash button next to "ให้โค้ชช่วยวาง" on PlanEditor. New `deletePlanForDate` server action wipes the daily_plans row for a date. Confirm via window.confirm. |
| **V4** | **Sanitize `tool_code` text from assistant replies.** Gemini sometimes regresses to emitting tool calls as `tool_code` markdown blocks instead of using native function calling — the actual tool call never fires, no `pending_plans` row gets created, and the chat just shows pseudo-Python. New `lib/llm/sanitize.ts` strips fenced ```tool_code``` / ```thought``` blocks, bare-label blocks, and inline `default_api.<tool>(...)` calls. Applied at the runtime layer before persistence. We can't recover the dropped tool call; user has to ask again, but at least the bubble stays readable. |
| **V5** | Prompt rule against `tool_code` emission. Added to commonHeader (every specialist gets it): *"ทุก tool call ต้องเรียกผ่าน native function calling เท่านั้น — ไม่ใช่พิมพ์ออกมาเป็นข้อความ."* Should reduce frequency of V4's failure mode. |

---

## Migrations summary

| File | Purpose |
|---|---|
| `0000_great_venus.sql` | Initial schema |
| `0001_user_background_workout_pause.sql` | Background fields + workout_paused |
| `0002_elite_lila_cheney.sql` | meal_library + sports_focus |
| `0003_nasty_the_hand.sql` | pending_plans |
| `0004_drop_test_user.sql` | Drop legacy test user |
| `0005_low_leper_queen.sql` | daily_plans.completion |

---

## Tools summary (LLM function-calling surface)

| Tool | Used by | Purpose |
|---|---|---|
| `log_meal` | Nutritionist | Insert meal log; auto-bumps meal_library usage |
| `log_workout` | Trainer | Insert workout log |
| `delete_log_entry` | Trainer, Nutritionist | Delete a meals/workouts row by id (after `get_history` lookup) |
| `update_plan` | Trainer, Meal Designer | **Tweaks only** — single-day field changes (toggle paused, swap one meal) |
| `propose_plan_bulk` | Trainer, Meal Designer | **All plan creation** (1-31 days) → drafts to `pending_plans`, user approves |
| `propose_meals` | Meal Designer | Single-day meal-only proposal (legacy; now mostly subsumed by propose_plan_bulk) |
| `save_meal` / `find_saved_meal` | Meal Designer, Nutritionist | Library CRUD |
| `update_memory` | All specialists | Long-term constraint storage with optional TTL |
| `update_profile` | Trainer, Nutritionist, Meal Designer | Whitelisted user-row field updates with additive/destructive safety classes |
| `get_history` | Trainer, Nutritionist, Reporter | Raw meal/workout/weight rows for a window |
| `get_history_summary` | Trainer, Nutritionist, Meal Designer, Reporter | Pre-aggregated insights (avg, max, trend, deltas) |
| `search_memory` | All specialists | ILIKE search over agent_memory |
| `get_plan` | Trainer, Reporter | Read a daily_plan row |

---

## Cron summary

| Path | Schedule (ICT) | What |
|---|---|---|
| `/api/cron/morning-report` | 07:00 | Pro-tier summary of yesterday's data + missed-workout rebalance + monthly-goal surfacing + optional LINE push |
| `/api/cron/nightly-plan` | 21:00 | Pre-plan tomorrow (Trainer + Meal Designer) + prune expired agent_memory + archive >30-day conversations into weekly summaries |
