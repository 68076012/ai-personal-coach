import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env", override: false });

import { sql } from "drizzle-orm";
import { db } from "./client";
import { users } from "./schema";

async function main() {
  console.log("Seeding users…");

  await db
    .insert(users)
    .values([
      {
        id: "garfield",
        name: "Garfield",
        sex: "M",
        age: 25,
        height_cm: 175,
        current_weight_kg: 75,
        goal: "ลดไขมัน คงกล้ามเนื้อ — ยังไม่ได้ตั้งเป้าแบบเฉพาะเจาะจง",
        goal_kcal: 2200,
        goal_protein_g: 130,
        goal_carb_g: 240,
        goal_fat_g: 70,
        activity_level: "moderate",
        accent_color: "coral",
      },
      {
        id: "partner",
        name: "Partner",
        sex: "F",
        age: 25,
        height_cm: 160,
        current_weight_kg: 55,
        goal: "เพิ่มความฟิต กินดี นอนดี — ยังไม่ได้ตั้งเป้าแบบเฉพาะเจาะจง",
        goal_kcal: 1700,
        goal_protein_g: 100,
        goal_carb_g: 190,
        goal_fat_g: 55,
        activity_level: "light",
        accent_color: "teal",
      },
    ])
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: sql`excluded.name`,
        updated_at: sql`now()`,
      },
    });

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
