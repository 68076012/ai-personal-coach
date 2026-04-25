import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const rows = await sql`
  select user_id, date::text as date, length(summary_md) as len, sent_at
  from morning_reports
  order by sent_at desc
  limit 5
`;
console.log("rows:", rows);

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
console.log("today (Asia/Bangkok):", today);

const sample = await sql`
  select summary_md from morning_reports where user_id='garfield' order by sent_at desc limit 1
`;
console.log("\n--- sample (first 1000 chars) ---");
console.log(sample[0]?.summary_md?.slice(0, 1000));

await sql.end();
