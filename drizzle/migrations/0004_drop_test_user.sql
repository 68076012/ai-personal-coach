-- Drop the legacy 'test' user and all of its dependent rows. The cron jobs
-- were running for this account too (morning report + nightly plan), which
-- burned LLM quota for an account that's not real. After this lands, code
-- changes (removing 'test' from UserId, login-picker, USERS arrays) prevent
-- it from being re-created.

DELETE FROM "meals"           WHERE "user_id" = 'test';
DELETE FROM "workouts"        WHERE "user_id" = 'test';
DELETE FROM "daily_logs"      WHERE "user_id" = 'test';
DELETE FROM "daily_plans"     WHERE "user_id" = 'test';
DELETE FROM "agent_memory"    WHERE "user_id" = 'test';
DELETE FROM "conversations"   WHERE "user_id" = 'test';
DELETE FROM "morning_reports" WHERE "user_id" = 'test';
DELETE FROM "meal_library"    WHERE "user_id" = 'test';
DELETE FROM "pending_plans"   WHERE "user_id" = 'test';
-- llm_calls.user_id has no FK constraint; keep its rows for cost-history continuity.
DELETE FROM "users"           WHERE "id" = 'test';
