# AI Personal Fitness Coach — Implementation Plan

> **For Claude Code**: This is the complete spec. Execute phases sequentially. Each phase has a Definition of Done (DoD). Ask the user before deviating from this plan.

---

## 0. Project Brief (TL;DR)

A web-based AI fitness coach for **2 hardcoded users** (Garfield + Partner) with **separate goals each**. Users log meals and workouts via chat, get personalized morning plans, and can dynamically adjust the day's plan by chatting (e.g., "got busy tonight, can we move workout?").

The system uses **multiple specialist AI agents** (Trainer, Nutritionist, Meal Designer, Daily Reporter) coordinated by an Orchestrator. Total **API cost target: $0/month** using Google Gemini free tier with smart routing.

**Conversation language**: Thai (UI labels can be Thai or bilingual).

---

## 1. Goals & Non-Goals

### Goals
- ✅ Beautiful chat-first web UI (mobile-friendly, single-page feel)
- ✅ 2 separate user contexts with custom goals each
- ✅ Multi-agent system with clearly differentiated personalities
- ✅ Dynamic plan updates via natural conversation
- ✅ Daily morning summary report (cron-triggered)
- ✅ Progress tracking (weight, calories, workout volume)
- ✅ Persistent agent memory across conversations
- ✅ $0/month operating cost using free tiers
- ✅ Production-ready deploy on Vercel

### Non-Goals (Phase 1)
- ❌ Mobile native app (web is responsive enough)
- ❌ Wearable integration (Apple Watch, Garmin)
- ❌ Social features (sharing, leaderboards)
- ❌ Photo-based food calorie estimation (Phase 2 — Gemini Vision)
- ❌ Voice input (Phase 2)
- ❌ Payment / multi-tenant (only 2 users hardcoded)

---

## 2. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router, RSC) + TypeScript | Vercel-native, server actions, streaming UI |
| Styling | **Tailwind CSS v4** + shadcn/ui | Fast, consistent, accessible defaults |
| UI primitives | **shadcn/ui** + Radix | Copy-paste components, full control |
| Icons | **lucide-react** | Clean, tree-shakable |
| Charts | **Recharts** | Simple API for progress charts |
| Database | **Supabase Postgres** (free tier 500MB) | Postgres + RLS + realtime if needed |
| ORM | **Drizzle ORM** | Type-safe, lightweight, good for serverless |
| Auth | **Custom hardcoded** (iron-session cookie) | Only 2 users, no need for full auth |
| LLM | **Google Gemini API** (AI Studio key) | Generous free tier (Pro 100 RPD + Flash 250 RPD + Flash-Lite 1000 RPD) |
| Search/Research | **Perplexity Sonar** (optional, $5 credit/mo from Pro) | Fact-checking exercises, recipes |
| Hosting | **Vercel Hobby** (free) | Cron jobs, edge runtime, native Next.js |
| Cron | **Vercel Cron** (free, 2/project on Hobby) | Morning report at 7:00 AM |
| Notifications | **LINE Notify** (free, Thailand-friendly) | Optional push for morning report |
| Validation | **Zod** | Runtime validation for LLM outputs |
| State | **Zustand** + React Server Components | Minimal client state |
| Date/Time | **date-fns** with Asia/Bangkok TZ | Avoid Date hell |
| Package manager | **pnpm** | Fast, disk-efficient |

### Why Vercel + Supabase (Claude Code's choice)
- **Free**: Both have generous free tiers that fit 2-user app forever
- **Vercel Cron** built-in → no extra service needed for morning reports
- **Vercel Edge Runtime** → fast streaming for chat
- **Supabase**: Postgres with RLS, dashboard, automatic backups, easy local dev with `supabase` CLI
- **Native Next.js integration** → fewer surprises
- **Claude Code familiarity** → less debugging

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Next.js client + RSC)                                 │
│  - Chat UI (streaming)                                          │
│  - Today's plan card                                            │
│  - Progress charts                                              │
│  - Quick log buttons                                            │
└───────────────────┬─────────────────────────────────────────────┘
                    │ Server Actions / API routes
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Server (Vercel)                                        │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │   Orchestrator (Gemini 2.5 Flash-Lite)                 │     │
│  │   Routes message → tools or specialist agent           │     │
│  └─────────────┬──────────────────────────────────────────┘     │
│                │                                                │
│      ┌─────────┼─────────┬──────────┬────────────┐              │
│      ▼         ▼         ▼          ▼            ▼              │
│   Trainer  Nutrition  Meal Des.  Reporter    Tools              │
│  (Flash)   (Flash)    (Flash)    (Pro)       (functions)        │
│   ─────    ───────    ────────   ──────                         │
│   All specialists share memory & history (per-user)             │
└────────┬───────────────────────┬────────────────────────────────┘
         │                       │
         ▼                       ▼
   ┌────────────┐         ┌──────────────────┐
   │ Supabase   │         │ Perplexity Sonar │
   │ (Postgres) │         │ (optional tool)  │
   └────────────┘         └──────────────────┘
         ▲
         │
   ┌─────┴──────────────────────────────────────┐
   │ Vercel Cron (07:00 Asia/Bangkok)           │
   │ → triggers /api/cron/morning-report        │
   │ → Reporter agent generates summary         │
   │ → optionally pings LINE Notify             │
   └────────────────────────────────────────────┘
```

### Request Flow Example
1. User types: *"กินข้าวกับไก่ทอด 2 ชิ้น มื้อกลางวัน"*
2. Server action → Orchestrator (Flash-Lite, cheap routing)
3. Orchestrator detects intent: `log_meal` → calls Nutritionist
4. Nutritionist (Flash):
   - Estimates macros (calorie/protein/carb/fat)
   - Calls `log_meal` tool → INSERT into `meals` table
   - Returns conversational reply with macro breakdown
5. Streamed back to UI
6. UI updates the meal log + macro progress bar

### Plan Update Flow (the dynamic part)
1. User: *"คืนนี้ติดประชุม ออกกำลังกายไม่ได้"*
2. Orchestrator → Trainer
3. Trainer:
   - Calls `update_memory` tool: stores constraint
   - Calls `update_plan` tool: moves planned workout to next day or substitutes 10-min mobility
   - Returns: *"งั้นพรุ่งนี้เพิ่ม sets นะ คืนนี้ทำ stretching 10 นาทีก่อนนอนก็พอ"*
4. UI re-fetches `today_plan` and shows updated card with a subtle "อัพเดทเมื่อ XX:XX" indicator

---

## 4. Multi-Agent Design

### Agent Roster

| Agent | Model | Role | Tools |
|---|---|---|---|
| **Orchestrator** | Flash-Lite | Intent routing, simple ack | `route_to`, `get_user_state` |
| **Trainer** | Flash (→ Pro for hard questions) | Workout coach, form, programming | `log_workout`, `update_plan`, `update_memory`, `get_history` |
| **Nutritionist** | Flash | Macro/calorie analysis, food guidance | `log_meal`, `update_memory`, `get_history` |
| **Meal Designer** | Flash | Daily menu, recipes, grocery | `propose_meals`, `update_plan`, `web_search` |
| **Reporter** | Pro | Morning summary + coaching questions | `get_history`, `get_plan`, `send_notification` |

### Smart Routing Rules (Orchestrator logic)
```
if message matches /(กิน|ทาน|มื้อ|อาหาร|cal|โปรตีน|carb)/i → Nutritionist
elif message matches /(set|rep|kg|ออกกำลัง|ฟิตเนส|เวท|cardio|เดิน|วิ่ง)/i → Trainer
elif message matches /(เมนู|recipe|วันนี้กินอะไรดี|grocery)/i → Meal Designer
elif message matches /(สรุป|progress|น้ำหนัก|รายงาน)/i → Reporter
else → Orchestrator answers directly with general fitness common sense
```

> Note: Orchestrator is also a Gemini call; it returns JSON `{ agent: "...", confidence: 0.x }`. If confidence < 0.6, it asks user to clarify instead of guessing.

### System Prompts (Thai, ready to copy)

**Common header (prepended to every specialist):**
```
คุณคือผู้ช่วย AI ใน fitness coach app สำหรับ 2 ผู้ใช้
ผู้ใช้ปัจจุบัน: {user_name}
เป้าหมาย: {user_goal}
ข้อมูลพื้นฐาน: เพศ {sex}, อายุ {age}, ส่วนสูง {height_cm}cm, น้ำหนักปัจจุบัน {current_weight_kg}kg
ความจำสำคัญเกี่ยวกับผู้ใช้ (จากการสนทนาก่อนหน้า):
{agent_memory_dump}

แผนของวันนี้:
{today_plan_json}

ตอบเป็นภาษาไทยเสมอ ใช้ภาษาที่กระชับ เป็นกันเอง คล้ายเพื่อนสนิทที่เป็นโค้ช
ห้ามวินิจฉัยทางการแพทย์ — ถ้าผู้ใช้บ่นเรื่องอาการบาดเจ็บหรือสุขภาพ ให้แนะนำให้พบผู้เชี่ยวชาญ
```

**Trainer-specific:**
```
บทบาท: คุณคือเทรนเนอร์ส่วนตัว เชี่ยวชาญเรื่อง strength training, hypertrophy, cardio และ mobility
หน้าที่:
- รับ log การออกกำลังกาย แล้วบันทึก
- ตอบคำถามเรื่อง form, programming, progressive overload
- ถาม follow-up เพื่อ coach: "ท่าที่ทำเมื่อวานโดนกล้ามเนื้อมั้ย?", "RPE เท่าไหร่?"
- เมื่อผู้ใช้ติดธุระ → เสนอทางเลือก (ย้ายวัน, ลด volume, ทำที่บ้าน)

วิธีตอบ:
- ถ้าผู้ใช้แค่ log → ตอบสั้น แล้ว ASK ATLEAST ONE coaching question
- ถ้าผู้ใช้ขอแผน → ใช้ tool update_plan
- ถ้าผู้ใช้บอกว่าทำไม่ได้ → ใช้ tool update_memory + update_plan

ใช้ tools ผ่าน function calling เสมอเมื่อต้องการ persist ข้อมูล
```

**Nutritionist-specific:**
```
บทบาท: คุณคือนักโภชนาการ เชี่ยวชาญเรื่อง macro tracking, calorie management, อาหารไทย/เอเชีย
หน้าที่:
- รับ log มื้ออาหาร → ประมาณ macros (kcal, protein, carb, fat)
- ตอบเป็น JSON ผ่าน tool log_meal เสมอ
- ให้ feedback สั้นๆ: เกิน/ขาด, สัดส่วน macro
- ถาม: "อิ่มมั้ย?", "พลังงานพอใช้ทั้งวันมั้ย?"

ความรู้สำคัญ:
- อาหารไทยจานเดียวเฉลี่ย 500-700 kcal
- ข้าวเหนียว 1 ถ้วยประมาณ 220 kcal
- ไก่ทอด 1 ชิ้น ~250-300 kcal
- ถ้าไม่แน่ใจ ให้ระบุเป็น range และ confidence
```

**Meal Designer-specific:**
```
บทบาท: คุณคือเชฟ + meal planner เชี่ยวชาญอาหารไทย/asian/มื้อปรุงเร็ว
หน้าที่:
- ออกแบบเมนูประจำวันตาม goal (calorie target + macro split)
- คำนึงถึง: ของในครัว (จาก memory), เวลาทำอาหาร, งบประมาณ
- เสนอ 2-3 ตัวเลือกพร้อมเหตุผล

Output format ต้องเรียก tool propose_meals เสมอ พร้อม schema:
[{ meal: "breakfast"|"lunch"|"dinner"|"snack", name, kcal, protein_g, carb_g, fat_g, prep_min, ingredients[] }]

ถ้าผู้ใช้ขอเปลี่ยนเมนู → propose alternatives ที่ macro ใกล้เคียงกัน
```

**Reporter-specific (Pro model):**
```
บทบาท: คุณคือโค้ชที่สรุปวันที่ผ่านมาและตั้งคำถามเช้าๆ
หน้าที่:
1. อ่านข้อมูล 24 ชั่วโมงล่าสุด (meals, workouts, weight, mood)
2. เปรียบเทียบกับ plan และ goal
3. สรุปเป็นรายงานสั้น (4-6 ประโยค) + 2 coaching questions

โครงสร้าง output (markdown):
## สรุปเมื่อวาน
- สิ่งที่ทำได้ดี
- จุดที่พลาด
- ตัวเลขสำคัญ (kcal, protein, workout volume)

## คำถามเช้านี้
1. ...
2. ...

## แผนวันนี้
- (ดึงจาก today_plan)

โทน: positive แต่ซื่อสัตย์ ไม่ลูบหลัง ไม่ดุ
```

### Tool Definitions (Gemini Function Calling)

```typescript
// All tools accept user_id and operate on that user's data only
const tools = {
  log_meal: {
    description: "บันทึกมื้ออาหาร พร้อมประมาณ macros",
    parameters: {
      datetime: "ISO 8601",
      meal_type: "breakfast | lunch | dinner | snack",
      food_name: "string",
      kcal: "number",
      protein_g: "number",
      carb_g: "number",
      fat_g: "number",
      confidence: "0..1",
      notes: "string?"
    }
  },

  log_workout: {
    description: "บันทึกการออกกำลังกาย",
    parameters: {
      datetime: "ISO 8601",
      exercise: "string",
      sets: "number",
      reps: "number",
      weight_kg: "number?",
      duration_min: "number?",
      rpe: "number? 1-10",
      notes: "string?"
    }
  },

  update_plan: {
    description: "อัพเดทแผนของวันนี้ (workout หรือ meals)",
    parameters: {
      date: "YYYY-MM-DD",
      changes: { workout: "?", meals: "?", reason: "string" }
    }
  },

  update_memory: {
    description: "บันทึกความจำระยะยาวเกี่ยวกับผู้ใช้",
    parameters: {
      key: "string (e.g. 'left_knee_pain', 'prefers_morning_workout')",
      value: "string",
      ttl_days: "number? default 90"
    }
  },

  get_history: {
    description: "ดึงประวัติ meals/workouts",
    parameters: {
      type: "meals | workouts | weight",
      days: "number default 7"
    }
  },

  get_plan: {
    description: "ดึงแผนของวันที่ระบุ",
    parameters: { date: "YYYY-MM-DD" }
  },

  propose_meals: {
    description: "เสนอเมนูสำหรับวัน",
    parameters: {
      date: "YYYY-MM-DD",
      meals: "array (see Meal Designer schema)"
    }
  },

  web_search: {
    description: "ค้นข้อมูลด้วย Perplexity (recipes, exercises)",
    parameters: { query: "string" }
  }
};
```

---

## 5. Database Schema

### Supabase Postgres (drizzle schema)

```typescript
// db/schema.ts
import { pgTable, uuid, text, timestamp, integer, real, jsonb, date, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),  // 'garfield' | 'partner'
  name: text('name').notNull(),
  sex: text('sex').notNull(),  // 'M' | 'F'
  age: integer('age').notNull(),
  height_cm: real('height_cm').notNull(),
  goal: text('goal').notNull(),  // free text: "ลด 5kg ใน 3 เดือน"
  goal_kcal: integer('goal_kcal'),  // daily target
  goal_protein_g: integer('goal_protein_g'),
  activity_level: text('activity_level'),  // 'sedentary'|'light'|'moderate'|'active'
  created_at: timestamp('created_at').defaultNow()
});

export const daily_logs = pgTable('daily_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => users.id).notNull(),
  date: date('date').notNull(),
  weight_kg: real('weight_kg'),
  sleep_hours: real('sleep_hours'),
  mood: text('mood'),  // 'great'|'good'|'ok'|'tired'|'bad'
  energy: integer('energy'),  // 1-10
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow()
});

export const meals = pgTable('meals', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => users.id).notNull(),
  datetime: timestamp('datetime').notNull(),
  meal_type: text('meal_type').notNull(),
  food_name: text('food_name').notNull(),
  kcal: integer('kcal').notNull(),
  protein_g: real('protein_g').notNull(),
  carb_g: real('carb_g').notNull(),
  fat_g: real('fat_g').notNull(),
  confidence: real('confidence'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow()
});

export const workouts = pgTable('workouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => users.id).notNull(),
  datetime: timestamp('datetime').notNull(),
  exercise: text('exercise').notNull(),
  sets: integer('sets'),
  reps: integer('reps'),
  weight_kg: real('weight_kg'),
  duration_min: integer('duration_min'),
  rpe: integer('rpe'),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow()
});

export const agent_memory = pgTable('agent_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => users.id).notNull(),
  agent_type: text('agent_type').notNull(),  // 'trainer'|'nutritionist'|'shared'
  key: text('key').notNull(),
  value: text('value').notNull(),
  expires_at: timestamp('expires_at'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow()
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => users.id).notNull(),
  agent_type: text('agent_type').notNull(),
  role: text('role').notNull(),  // 'user'|'assistant'|'tool'
  content: text('content').notNull(),
  tool_calls: jsonb('tool_calls'),
  created_at: timestamp('created_at').defaultNow()
});

export const daily_plans = pgTable('daily_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => users.id).notNull(),
  date: date('date').notNull(),
  workout_plan: jsonb('workout_plan'),  // [{exercise, sets, reps, weight}]
  meal_plan: jsonb('meal_plan'),  // [{meal_type, name, kcal, ...}]
  notes: text('notes'),
  generated_at: timestamp('generated_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow()
});

export const morning_reports = pgTable('morning_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').references(() => users.id).notNull(),
  date: date('date').notNull(),
  summary_md: text('summary_md').notNull(),
  questions: jsonb('questions'),
  sent_at: timestamp('sent_at').defaultNow()
});
```

### Indexes (add manually after migration)
```sql
CREATE INDEX idx_meals_user_datetime ON meals(user_id, datetime DESC);
CREATE INDEX idx_workouts_user_datetime ON workouts(user_id, datetime DESC);
CREATE INDEX idx_conversations_user_agent ON conversations(user_id, agent_type, created_at DESC);
CREATE INDEX idx_agent_memory_user_agent ON agent_memory(user_id, agent_type);
CREATE UNIQUE INDEX idx_daily_plans_user_date ON daily_plans(user_id, date);
```

### Seed Data
```sql
INSERT INTO users (id, name, sex, age, height_cm, goal, goal_kcal, goal_protein_g, activity_level)
VALUES
  ('garfield', 'Garfield', 'M', 25, 175, 'TBD - fill from .env', 2200, 130, 'moderate'),
  ('partner', 'Partner', 'F', 25, 160, 'TBD - fill from .env', 1700, 100, 'light');
```

> **Note for Claude Code**: ask the user for actual age/height/goal values before seeding. Use placeholders if user defers.

---

## 6. Smart Router & Fallback Chain

### Model Routing Logic
```typescript
// lib/llm/route.ts
type ModelTier = 'pro' | 'flash' | 'flash-lite';

interface CallOptions {
  agent: AgentType;
  task: 'route' | 'log' | 'chat' | 'plan' | 'report';
  hasTools: boolean;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

function chooseModel(opts: CallOptions): ModelTier {
  // Reporter (morning summary) always gets best model
  if (opts.agent === 'reporter') return 'pro';

  // Orchestrator routing → cheapest
  if (opts.task === 'route') return 'flash-lite';

  // Simple logging → flash-lite
  if (opts.task === 'log') return 'flash-lite';

  // Plan generation → pro for quality
  if (opts.task === 'plan') return 'pro';

  // High complexity (e.g., user asks deep training question) → pro
  if (opts.estimatedComplexity === 'high') return 'pro';

  // Default to flash for chat
  return 'flash';
}
```

### Fallback Chain (when rate-limited)
```typescript
// lib/llm/client.ts
const FALLBACK_CHAIN: Record<ModelTier, ModelTier[]> = {
  'pro': ['pro', 'flash', 'flash-lite'],
  'flash': ['flash', 'flash-lite'],
  'flash-lite': ['flash-lite']
};

async function callGemini(tier: ModelTier, payload: any) {
  const chain = FALLBACK_CHAIN[tier];
  let lastError: Error | null = null;

  for (const model of chain) {
    try {
      return await rawCall(model, payload);
    } catch (err: any) {
      lastError = err;
      // 429 = rate limit, try next tier
      if (err.status === 429) {
        console.warn(`[llm] ${model} rate-limited, trying ${chain[chain.indexOf(model) + 1]}`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`All models failed. Last: ${lastError?.message}`);
}
```

### Daily Quota Tracking (in-memory + DB)
```typescript
// Track per-day call counts to predict rate limit before hitting it
// Simple: store in a tiny table, increment on each call, reset at midnight PT
```

### Context Management
- **Truncate conversation** to last 10 turns + summary of older
- **System prompt + user profile** is part of input — eligible for Gemini context caching
- **Memory dump** capped at 20 most-relevant entries (sorted by `updated_at DESC`)

---

## 7. Frontend Design

### Pages
| Route | Purpose |
|---|---|
| `/` | Login picker (just two buttons: "I'm Garfield" / "I'm Partner" + passcode field) |
| `/dashboard` | Today's view (default after login) |
| `/dashboard/chat` | Full-screen chat view |
| `/dashboard/progress` | Charts + history |
| `/dashboard/plan` | Today + tomorrow's plan, editable |
| `/dashboard/settings` | Profile, goals, goal_kcal etc. |

### Layout (mobile-first)
```
┌──────────────────────────────────┐
│  ☰  Coach     [G/P avatar]   ⚙  │  ← top bar (sticky)
├──────────────────────────────────┤
│                                  │
│  [main content scrolls]          │
│                                  │
│  - Today plan card               │
│  - Macros progress ring          │
│  - Recent meals/workouts list    │
│  - Latest coach message          │
│                                  │
├──────────────────────────────────┤
│  💬 พิมพ์เพื่อ log หรือคุย...   ▶  │  ← chat input (sticky bottom)
└──────────────────────────────────┘
```

### Components (shadcn/ui-based)
- `<TopBar />` — user avatar, settings link
- `<TodayPlanCard />` — shows workout + meals planned, with "อัพเดทเมื่อ X นาทีที่แล้ว"
- `<MacroRing />` — circular progress for kcal/protein/carb/fat
- `<RecentLogs />` — vertical timeline of meals/workouts
- `<ChatInput />` — sticky bottom, with send + voice (Phase 2) buttons
- `<ChatMessage />` — bubble with agent badge (color-coded), supports markdown
- `<AgentBadge />` — shows which agent replied (Trainer/Nutritionist/etc.)
- `<ProgressChart />` — line chart for weight, bar chart for kcal
- `<QuickActions />` — preset buttons: "Log breakfast", "Done with workout", "Replan today"

### Visual Design
- **Color palette**: warm neutrals + one accent (e.g. coral for Garfield, teal for Partner — auto-themed by user)
- **Typography**: Inter or system sans, IBM Plex Sans Thai for Thai
- **Spacing**: generous (mobile-first), 16px base
- **Dark mode**: yes (system preference)
- **Animations**: subtle (framer-motion for chat bubbles fade-in)
- **Loading states**: streaming text (token-by-token) for chat

### Critical UX Patterns
1. **Streaming chat**: tokens appear as they arrive (Vercel AI SDK `useChat` hook)
2. **Optimistic updates**: when user logs a meal, show it immediately, sync in background
3. **Plan diff indicator**: when plan auto-updates, show "อัพเดทเมื่อ Xm" badge — clickable to see what changed
4. **Quick log buttons**: 4-tap log ("กินข้าว" → "เมื่อไหร่" → "ปริมาณ" → "ส่ง")
5. **Empty states**: friendly Thai copy ("ยังไม่มี log วันนี้ — เริ่มที่มื้อเช้ามั้ย?")

---

## 8. File Structure

```
fitness-coach/
├── app/
│   ├── (auth)/
│   │   └── page.tsx                    # Login picker
│   ├── (app)/
│   │   ├── layout.tsx                  # Auth check + TopBar
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # Today's view
│   │   │   ├── chat/page.tsx
│   │   │   ├── progress/page.tsx
│   │   │   ├── plan/page.tsx
│   │   │   └── settings/page.tsx
│   ├── api/
│   │   ├── chat/route.ts               # Streaming POST endpoint
│   │   ├── cron/
│   │   │   ├── morning-report/route.ts
│   │   │   └── nightly-plan/route.ts
│   │   └── log/
│   │       ├── meal/route.ts           # quick log endpoint (used by tools)
│   │       └── workout/route.ts
│   ├── globals.css
│   └── layout.tsx                      # root + theme provider
├── components/
│   ├── ui/                             # shadcn components
│   ├── chat/
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   ├── AgentBadge.tsx
│   │   └── StreamingMarkdown.tsx
│   ├── dashboard/
│   │   ├── TodayPlanCard.tsx
│   │   ├── MacroRing.tsx
│   │   ├── RecentLogs.tsx
│   │   └── QuickActions.tsx
│   ├── progress/ProgressChart.tsx
│   └── TopBar.tsx
├── lib/
│   ├── auth.ts                         # iron-session config
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts                   # drizzle client
│   │   └── queries.ts                  # typed queries
│   ├── llm/
│   │   ├── client.ts                   # Gemini wrapper + fallback
│   │   ├── route.ts                    # model selection
│   │   ├── tools.ts                    # tool definitions + handlers
│   │   ├── agents/
│   │   │   ├── orchestrator.ts
│   │   │   ├── trainer.ts
│   │   │   ├── nutritionist.ts
│   │   │   ├── meal-designer.ts
│   │   │   └── reporter.ts
│   │   └── prompts/
│   │       ├── common.ts
│   │       ├── trainer.ts
│   │       ├── nutritionist.ts
│   │       ├── meal-designer.ts
│   │       └── reporter.ts
│   ├── perplexity.ts                   # optional Sonar tool
│   ├── line-notify.ts                  # optional notification
│   └── utils.ts
├── drizzle/
│   ├── migrations/
│   └── meta/
├── public/
├── .env.local.example
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json                         # cron schedule
```

---

## 9. Environment Variables

```bash
# .env.local.example

# Supabase
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # server-side only

# Gemini
GOOGLE_API_KEY=AIza...                  # from AI Studio (free tier)
GOOGLE_API_KEY_SECONDARY=AIza...        # optional: 2nd project for partner → 2x quota

# Perplexity (optional)
PERPLEXITY_API_KEY=pplx-...

# Auth (iron-session)
AUTH_SECRET=  # 32+ char random string
GARFIELD_PASSCODE=  # whatever you choose
PARTNER_PASSCODE=

# Cron
CRON_SECRET=  # random — Vercel will pass this in Authorization header

# LINE Notify (optional)
LINE_NOTIFY_TOKEN_GARFIELD=
LINE_NOTIFY_TOKEN_PARTNER=

# App
NEXT_PUBLIC_APP_URL=https://fitness-coach.vercel.app
TZ=Asia/Bangkok
```

### Vercel Cron Setup (`vercel.json`)
```json
{
  "crons": [
    {
      "path": "/api/cron/morning-report",
      "schedule": "0 0 * * *"  // 00:00 UTC = 07:00 Asia/Bangkok
    },
    {
      "path": "/api/cron/nightly-plan",
      "schedule": "0 14 * * *"  // 14:00 UTC = 21:00 Asia/Bangkok (plan tomorrow)
    }
  ]
}
```

> Cron endpoint must verify `Authorization: Bearer ${CRON_SECRET}`.

---

## 10. Implementation Phases

> **Each phase has a Definition of Done. Don't move to next phase until DoD is met.**

### Phase 1 — Bootstrap (Day 1)
**Tasks:**
1. `pnpm create next-app fitness-coach --typescript --tailwind --app --src-dir=false`
2. Install: `drizzle-orm postgres @vercel/postgres zod iron-session date-fns date-fns-tz lucide-react recharts zustand framer-motion`
3. Install dev: `drizzle-kit @types/node`
4. Set up shadcn/ui: `pnpm dlx shadcn@latest init` then add: button, card, input, dialog, sheet, tabs, toast, avatar, scroll-area, badge
5. Create `.env.local` from example
6. Set up Supabase project, copy credentials, run migrations
7. Create root layout with theme provider, fonts (Inter + IBM Plex Sans Thai)

**DoD:** `pnpm dev` shows blank Next.js page on `localhost:3000`, DB connection works (`pnpm drizzle-kit push` succeeds).

---

### Phase 2 — Auth + DB Schema (Day 1-2)
**Tasks:**
1. Implement `lib/db/schema.ts` (full schema from §5)
2. Run `pnpm drizzle-kit generate && pnpm drizzle-kit push`
3. Seed users (use Supabase SQL editor or a `pnpm seed` script)
4. Build login page (`app/(auth)/page.tsx`):
   - Two big buttons "ฉันคือ Garfield" / "ฉันคือ Partner"
   - Reveals passcode input
   - On submit → POST `/api/auth/login` → sets iron-session cookie
5. Implement middleware to protect `/dashboard/*` routes
6. Add logout button in TopBar

**DoD:** Both users can log in/out, session persists, unauth users redirected to `/`.

---

### Phase 3 — Single Agent (Trainer Only) (Day 3-5)
**Goal:** Get one agent working end-to-end before scaling to many.

**Tasks:**
1. Implement `lib/llm/client.ts`:
   - Gemini SDK wrapper (`@google/genai` package)
   - Fallback chain (Pro → Flash → Flash-Lite)
   - Error handling for 429
2. Implement `lib/llm/agents/trainer.ts`:
   - Loads user profile + memory + plan
   - Calls Gemini with system prompt + tools
   - Handles tool calls (log_workout, update_memory, update_plan, get_history)
   - Returns streaming response
3. Implement `app/api/chat/route.ts`:
   - Accepts `{ message, agent: 'trainer' }`
   - Streams response back (Vercel AI SDK or SSE)
4. Build minimal chat UI in `/dashboard/chat`:
   - Message list with `<ChatMessage>`
   - Input box
   - Streaming token display

**DoD:** User can chat with Trainer, log a workout, see it persist in DB, agent remembers across messages.

---

### Phase 4 — Multi-Agent + Orchestrator (Day 6-8)
**Tasks:**
1. Implement `lib/llm/agents/orchestrator.ts` (Flash-Lite):
   - Returns `{ agent, confidence, reason }`
2. Implement remaining specialists: Nutritionist, Meal Designer
3. Update `/api/chat`:
   - First call Orchestrator
   - Route to chosen specialist
   - If confidence < 0.6 → ask user to clarify
4. Add `<AgentBadge>` to chat messages (color-coded)
5. Test scenarios:
   - "กินข้าวเที่ยงไก่ทอด" → Nutritionist logs
   - "Squat 60kg 4x8" → Trainer logs
   - "พรุ่งนี้กินอะไรดี" → Meal Designer plans
   - "ติดธุระคืนนี้" → Trainer updates plan

**DoD:** Each scenario routes correctly and persists. Plan updates show in UI.

---

### Phase 5 — Today's View + Plan UI (Day 9-10)
**Tasks:**
1. Build `/dashboard` (today's view):
   - `<TodayPlanCard>` showing workout + meals
   - `<MacroRing>` showing kcal/protein progress vs goal
   - `<RecentLogs>` last 5 entries
2. Build `/dashboard/plan`:
   - Today + Tomorrow side-by-side
   - Editable inline (or via chat)
3. Implement Server Actions for editing plan
4. Add quick action buttons

**DoD:** User sees clear daily progress, plan updates live when chat changes it.

---

### Phase 6 — Reporter + Cron (Day 11)
**Tasks:**
1. Implement `lib/llm/agents/reporter.ts` (Pro):
   - Pulls last 24h of data
   - Generates markdown summary + 2 questions
   - Saves to `morning_reports` table
2. Implement `/api/cron/morning-report/route.ts`:
   - Verify `CRON_SECRET`
   - Loop over both users
   - Call Reporter
   - (Optional) send LINE Notify
3. Implement `/api/cron/nightly-plan/route.ts`:
   - Use Meal Designer + Trainer to plan tomorrow
4. Add `vercel.json` cron config

**DoD:** Both crons run on schedule (test with `vercel cron trigger`). Morning report appears in app at 7am.

---

### Phase 7 — Progress Charts (Day 12)
**Tasks:**
1. Build `/dashboard/progress`:
   - Weight line chart (last 30/90 days)
   - Daily kcal bar chart with goal line
   - Workout volume trend
   - Streak counter
2. Use Recharts; data via Server Components

**DoD:** Charts render correctly with real data, mobile-responsive.

---

### Phase 8 — Polish + Deploy (Day 13-14)
**Tasks:**
1. Mobile responsive QA on iPhone + Android
2. Dark mode polish
3. Empty states + error boundaries
4. Loading skeletons
5. Toast notifications for actions
6. Add app icon + manifest (PWA-friendly)
7. Deploy to Vercel:
   - `vercel link`
   - Add all env vars in Vercel dashboard
   - Connect to GitHub repo
   - Configure cron via `vercel.json`
8. Smoke test in production

**DoD:** App works on production URL for both users, cron runs successfully overnight.

---

## 11. Deployment Guide (for Claude Code)

### One-time setup
```bash
# 1. GitHub repo
gh repo create fitness-coach --private --source=. --push

# 2. Vercel
pnpm i -g vercel
vercel link

# 3. Supabase
# Create project at supabase.com → copy DATABASE_URL
# Run: pnpm drizzle-kit push

# 4. Gemini API key
# Visit aistudio.google.com → Get API key → Free tier
# (Optional) Create 2nd project for 2x daily quota → GOOGLE_API_KEY_SECONDARY

# 5. Set env vars in Vercel dashboard (or via CLI)
vercel env add DATABASE_URL production
vercel env add GOOGLE_API_KEY production
# ... etc

# 6. Deploy
vercel --prod
```

### Domain (optional)
- Use free `*.vercel.app` subdomain
- Or attach a custom domain via Vercel dashboard

---

## 12. Testing Checklist

### Manual smoke tests (in order)
- [ ] Login as Garfield with passcode → lands on dashboard
- [ ] Logout, login as Partner → sees different data
- [ ] Type "กินข้าวเที่ยงผัดไทย 1 จาน" → Nutritionist logs, kcal appears in Macro Ring
- [ ] Type "Squat 80kg 5x5 RPE 8" → Trainer logs to workouts table
- [ ] Type "พรุ่งนี้แนะนำเมนูหน่อย" → Meal Designer proposes plan
- [ ] Type "คืนนี้ติดประชุม ทำ workout ไม่ทัน" → Trainer updates plan, today's plan UI reflects change
- [ ] Visit /progress → see chart with logged data
- [ ] Trigger cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/morning-report`
- [ ] Wait until 7am, confirm morning report appears
- [ ] Test rate limit: spam 100+ Pro requests → confirm fallback to Flash works gracefully
- [ ] Test on mobile (Safari iOS + Chrome Android)

### Edge cases
- [ ] User logs the same meal twice → handle gracefully (just log both, no dedup needed)
- [ ] Gemini returns malformed tool call → Zod validation catches, agent retries with corrected format
- [ ] All 3 Gemini tiers exhausted → show friendly error: "AI quota หมดวันนี้ — ลองพรุ่งนี้นะ"
- [ ] User asks about medical concern ("เข่าเจ็บ") → Trainer recommends seeing PT, doesn't diagnose

---

## 13. Cost & Quota Monitoring

### Built-in dashboard route: `/dashboard/admin`
Show:
- Today's API calls per model tier (Pro / Flash / Flash-Lite)
- Quota remaining (estimated)
- DB row counts per table
- Any 429 errors in last 24h

### Hard cap to prevent runaway cost
```typescript
// lib/llm/client.ts
const DAILY_CALL_CAP = {
  pro: 90,        // leave 10 RPD buffer per day
  flash: 230,
  'flash-lite': 950
};
// If cap hit, return cached/canned response instead of calling API
```

---

## 14. Future Enhancements (Phase 2)

| Feature | Effort | Value |
|---|---|---|
| Photo → meal kcal estimation (Gemini Vision) | Low | High |
| Voice input (Web Speech API) | Low | Med |
| Apple Health / Google Fit sync | Med | High |
| Weekly Obsidian export (cron + markdown gen) | Low | Med |
| Shared "couple goals" view | Low | Med |
| LINE bot for chat outside the app | Med | Med |
| RAG over past conversations (vector store) | High | High (better memory) |
| Gemini 3.x when free tier opens up | Trivial | High |

---

## 15. Things Claude Code Should Ask the User

Before executing, please confirm with the user:

1. **Actual user details** for seed data:
   - Garfield: actual age, height, current weight, specific goal, daily kcal target
   - Partner: same set
2. **Passcode** values (or auto-generate and tell user)
3. **GitHub repo name** preference
4. **Vercel project name** + custom domain (or `.vercel.app` is fine)
5. **LINE Notify** integration: yes/no?
6. **Daily target macros**: should they be auto-calculated from goal + TDEE, or user-specified?
7. **Coach personality**: warm-and-encouraging, blunt-and-honest, or both? (Affects system prompt tone)
8. **Privacy mode**: enable Gemini billing (paid tier) to opt out of training data, or stick with free + accept data may train models?

---

## 16. Quick-Reference: System Prompt Skeleton

```
[COMMON_HEADER]
- Current user: {name}
- Goal: {goal}
- Today: {YYYY-MM-DD}, Day of week: {dow}
- Current weight: {weight_kg}kg
- Today's macros so far: {kcal_consumed}/{goal_kcal} kcal
- Today's plan summary: {plan_summary}
- Recent memory:
  {top 10 agent_memory entries}
- Last 24h logs:
  {bullet list of meals + workouts}

[AGENT_SPECIFIC_PROMPT]
(per agent file in lib/llm/prompts/)

[TOOL_USAGE_RULES]
- Always call log_meal/log_workout when user reports activity
- Always call update_memory when user shares a new constraint/preference
- Always call update_plan when user wants schedule change
- Never invent data — if uncertain, ask
- Reply in Thai, conversational tone

[OUTPUT_FORMAT]
First: emit any tool calls needed
Then: short conversational reply (≤ 3 sentences typically)
Optionally: end with a coaching question
```

---

## 17. Success Criteria

The project is "done" when:
- ✅ Both users can chat naturally in Thai and have meals/workouts logged accurately
- ✅ Plan adjusts dynamically when user reports schedule changes
- ✅ Morning report arrives daily with personalized insights
- ✅ App is deployed to production URL, accessible from mobile
- ✅ Total monthly cost = $0 (verified via Vercel + Supabase + Gemini dashboards)
- ✅ Both users use it for at least 1 week and find it actually useful (not just demo)

---

**End of plan.** Hand this to Claude Code with: "Execute PLAN.md phases 1-8 sequentially, asking me before any non-trivial decisions."
