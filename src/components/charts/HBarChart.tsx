"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const PALETTE = [
  "#22d3ee", // primary
  "#38BDF8", // input
  "#818CF8", // output
  "#10B981", // normal
  "#F59E0B", // warning
  "#EF4444", // exceeded
  "#bdc2ff", // secondary
  "#ffd6a3", // tertiary
];

export function HBarChart({
  data,
  valueLabel = "Cost",
  isCurrency = true,
}: {
  data: { name: string; value: number }[];
  valueLabel?: string;
  isCurrency?: boolean;
}) {
  return (
    <div style={{ height: Math.max(220, data.length * 36) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            stroke="#475569"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              isCurrency
                ? `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`
                : v >= 1_000_000
                ? (v / 1_000_000).toFixed(1) + "M"
                : v >= 1_000
                ? (v / 1_000).toFixed(0) + "K"
                : v.toFixed(0)
            }
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#94A3B8"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <Tooltip
            cursor={{ fill: "rgba(34,211,238,0.06)" }}
            contentStyle={{
              backgroundColor: "#0F172A",
              border: "1px solid #1E293B",
              borderRadius: 8,
              fontSize: 12,
              color: "#dde4e5",
              fontFamily: "Inter",
            }}
            formatter={(value: number) =>
              isCurrency
                ? [`$${value.toFixed(2)}`, valueLabel]
                : [value.toLocaleString(), valueLabel]
            }
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
