"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Briefcase, Clock, Wallet, Refrigerator, Leaf } from "lucide-react";
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

function nullIfEmpty(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
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
  const [workHours, setWorkHours] = useState(user.work_hours ?? "");
  const [workoutWindow, setWorkoutWindow] = useState(user.workout_window ?? "");
  const [budget, setBudget] = useState(user.budget_per_day_thb?.toString() ?? "");
  const [pantry, setPantry] = useState(user.pantry_ingredients ?? "");
  const [dietary, setDietary] = useState(user.dietary_notes ?? "");
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
          work_hours: nullIfEmpty(workHours),
          workout_window: nullIfEmpty(workoutWindow),
          budget_per_day_thb: toNumberOrNull(budget),
          pantry_ingredients: nullIfEmpty(pantry),
          dietary_notes: nullIfEmpty(dietary),
        });
        toast.success("บันทึกเป้าหมายแล้ว — โค้ชจะใช้ข้อมูลใหม่ในการสนทนาครั้งถัดไป");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">เป้าหมาย</CardTitle>
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
              <Input id="kcal" type="number" inputMode="numeric" placeholder="2200" value={kcal} onChange={(e) => setKcal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight" className="text-xs">น้ำหนักปัจจุบัน (kg)</Label>
              <Input id="weight" type="number" step="0.1" inputMode="decimal" placeholder="75" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="protein" className="text-xs">โปรตีน (g)</Label>
              <Input id="protein" type="number" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="carb" className="text-xs">คาร์บ (g)</Label>
              <Input id="carb" type="number" inputMode="numeric" value={carb} onChange={(e) => setCarb(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fat" className="text-xs">ไขมัน (g)</Label>
              <Input id="fat" type="number" inputMode="numeric" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="age" className="text-xs">อายุ</Label>
              <Input id="age" type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="height" className="text-xs">ส่วนสูง (cm)</Label>
              <Input id="height" type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity" className="text-xs">Activity level</Label>
              <select id="activity" value={activity} onChange={(e) => setActivity(e.target.value)} className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm shadow-xs">
                {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            ข้อมูลพื้นฐาน
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ช่วยให้โค้ชวางแผนได้แม่นขึ้น (ไม่บังคับ)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="work_hours" className="flex items-center gap-1.5 text-xs">
                <Briefcase className="size-3.5" />
                เวลาทำงาน
              </Label>
              <Input id="work_hours" placeholder="เช่น 9-18, จันทร์-ศุกร์ (WFH วันพุธ)" value={workHours} onChange={(e) => setWorkHours(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workout_window" className="flex items-center gap-1.5 text-xs">
                <Clock className="size-3.5" />
                เวลาว่างออกกำลังกาย
              </Label>
              <Input id="workout_window" placeholder="เช่น เย็น 18:30-19:30 (ยกเว้นพุธ)" value={workoutWindow} onChange={(e) => setWorkoutWindow(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budget" className="flex items-center gap-1.5 text-xs">
              <Wallet className="size-3.5" />
              งบอาหาร/วัน (บาท)
            </Label>
            <Input id="budget" type="number" inputMode="numeric" placeholder="เช่น 250" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pantry" className="flex items-center gap-1.5 text-xs">
              <Refrigerator className="size-3.5" />
              ของในครัว / วัตถุดิบที่มี
            </Label>
            <Textarea id="pantry" rows={3} placeholder="เช่น ไข่ 12 ฟอง, อกไก่ 500g, ข้าวกล้อง, ผักบุ้ง, นมจืด" value={pantry} onChange={(e) => setPantry(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              โค้ชเชฟจะพยายามวางเมนูจากของที่มีก่อน
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dietary" className="flex items-center gap-1.5 text-xs">
              <Leaf className="size-3.5" />
              อาหารที่กิน/ไม่กิน, แพ้, ความชอบ
            </Label>
            <Textarea id="dietary" rows={2} placeholder="เช่น แพ้กุ้ง, ไม่กินผักชี, ชอบอาหารเผ็ด" value={dietary} onChange={(e) => setDietary(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={pending}>
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </Button>
      </div>
    </div>
  );
}
