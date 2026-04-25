"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateGoal } from "@/app/(app)/dashboard/settings/actions";
import type { User } from "@/lib/db/schema";

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "นั่งโต๊ะทั้งวัน",
  light: "ขยับเล็กน้อย",
  moderate: "ออกกำลังกาย 3-5 ครั้ง/สัปดาห์",
  active: "ออกกำลังกายเกือบทุกวัน",
};

function toNumberOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function GoalEditor({ user }: { user: User }) {
  const [goal, setGoal] = useState(user.goal ?? "");
  const [kcal, setKcal] = useState(user.goal_kcal?.toString() ?? "");
  const [protein, setProtein] = useState(user.goal_protein_g?.toString() ?? "");
  const [carb, setCarb] = useState(user.goal_carb_g?.toString() ?? "");
  const [fat, setFat] = useState(user.goal_fat_g?.toString() ?? "");
  const [activity, setActivity] = useState(user.activity_level ?? "moderate");
  const [weight, setWeight] = useState(user.current_weight_kg?.toString() ?? "");
  const [age, setAge] = useState(user.age.toString());
  const [height, setHeight] = useState(user.height_cm.toString());
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      try {
        await updateGoal({
          goal: goal.trim(),
          goal_kcal: toNumberOrNull(kcal),
          goal_protein_g: toNumberOrNull(protein),
          goal_carb_g: toNumberOrNull(carb),
          goal_fat_g: toNumberOrNull(fat),
          activity_level: (activity as "sedentary" | "light" | "moderate" | "active") || null,
          current_weight_kg: toNumberOrNull(weight),
          age: Math.round(toNumberOrNull(age) ?? user.age),
          height_cm: toNumberOrNull(height) ?? user.height_cm,
        });
        toast.success("บันทึกเป้าหมายแล้ว — โค้ชจะใช้ข้อมูลใหม่ในการสนทนาครั้งถัดไป");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">เป้าหมาย & โปรไฟล์</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="goal" className="text-xs">
            เป้าหมาย (ใส่เป็นข้อความอิสระ — โค้ชจะอ้างอิงทุกครั้งที่คุย)
          </Label>
          <Textarea
            id="goal"
            rows={2}
            placeholder="เช่น ลด 5kg ใน 3 เดือน โดยคงกล้ามเนื้อ"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="kcal" className="text-xs">เป้า kcal/วัน</Label>
            <Input
              id="kcal"
              type="number"
              inputMode="numeric"
              placeholder="2200"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weight" className="text-xs">น้ำหนักปัจจุบัน (kg)</Label>
            <Input
              id="weight"
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder="75"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="protein" className="text-xs">โปรตีน (g)</Label>
            <Input
              id="protein"
              type="number"
              inputMode="numeric"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carb" className="text-xs">คาร์บ (g)</Label>
            <Input
              id="carb"
              type="number"
              inputMode="numeric"
              value={carb}
              onChange={(e) => setCarb(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fat" className="text-xs">ไขมัน (g)</Label>
            <Input
              id="fat"
              type="number"
              inputMode="numeric"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="age" className="text-xs">อายุ</Label>
            <Input
              id="age"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="height" className="text-xs">ส่วนสูง (cm)</Label>
            <Input
              id="height"
              type="number"
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="activity" className="text-xs">Activity level</Label>
            <select
              id="activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs"
            >
              {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={onSave} disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
