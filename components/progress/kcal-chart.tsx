"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface KcalPoint {
  date: string;
  kcal: number;
}

export function KcalChart({ data, goal }: { data: KcalPoint[]; goal: number | null }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
        ยังไม่มีข้อมูลแคลอรี่
      </div>
    );
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              color: "var(--popover-foreground)",
            }}
          />
          {goal && (
            <ReferenceLine
              y={goal}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{ value: `เป้า ${goal}`, position: "right", fontSize: 11, fill: "#10b981" }}
            />
          )}
          <Bar dataKey="kcal" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
