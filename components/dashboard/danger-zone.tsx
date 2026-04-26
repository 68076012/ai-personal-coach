"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetAccount } from "@/app/(app)/dashboard/settings/actions";

const CONFIRM_PHRASE = "RESET";

export function DangerZone({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (typed !== CONFIRM_PHRASE) return;
    startTransition(async () => {
      try {
        const res = await resetAccount({ confirmation: "RESET" });
        const total = Object.entries(res.deleted)
          .filter(([k]) => k !== "user_row_deleted")
          .reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
        toast.success(
          `รีเซ็ตเรียบร้อย — ลบข้อมูล ${total} รายการ (โปรไฟล์/เป้าหมายยังอยู่)`,
        );
        setOpen(false);
        setTyped("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "รีเซ็ตไม่สำเร็จ");
      }
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
          <AlertTriangle className="size-4" />
          Danger zone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm">รีเซ็ตข้อมูลทั้งหมดของบัญชี</p>
          <p className="text-xs text-muted-foreground">
            ลบ meals, workouts, plans, conversations, memory, library, pending plans, weight logs และ morning reports —
            <span className="font-medium"> โปรไฟล์/เป้าหมายและประวัติการเรียก AI (telemetry) จะคงไว้</span>
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setTyped("");
          }}
        >
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={pending}
          >
            <Trash2 className="size-4" />
            รีเซ็ตบัญชี
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ยืนยันรีเซ็ตบัญชี {userName}?</DialogTitle>
              <DialogDescription>
                จะลบข้อมูลกิจกรรมทั้งหมดของคุณอย่างถาวร — undo ไม่ได้.
                โปรไฟล์ (อายุ, ส่วนสูง, เป้าหมาย, sports_focus ฯลฯ) และ telemetry การใช้ AI จะคงไว้.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-xs">
                พิมพ์ <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> เพื่อยืนยัน
              </Label>
              <Input
                id="confirm"
                autoComplete="off"
                placeholder={CONFIRM_PHRASE}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={pending}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                ยกเลิก
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={typed !== CONFIRM_PHRASE || pending}
                onClick={onConfirm}
              >
                {pending ? "กำลังลบ…" : "ลบทั้งหมด"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
