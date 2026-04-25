import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: tsx scripts/reset-user.mts <user_id>");
  console.error("Example: tsx scripts/reset-user.mts garfield");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const tables = [
  "meals",
  "workouts",
  "daily_logs",
  "daily_plans",
  "agent_memory",
  "conversations",
  "morning_reports",
  "llm_calls",
] as const;

console.log(`Wiping all data for user_id='${userId}' (keeping users row)…`);

for (const table of tables) {
  const result = await sql`delete from ${sql(table)} where user_id = ${userId}`;
  console.log(`  ${table}: ${result.count} rows deleted`);
}

const remainingUser = await sql`select id, name, goal from users where id = ${userId}`;
console.log("\nUser row preserved:", remainingUser[0]);

await sql.end();
console.log("Done.");
