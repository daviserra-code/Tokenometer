"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export type DualPoint = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
};

const axisProps = {
  stroke: "#475569",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
  fontFamily: "Inter, ui-monospace, monospace",
};

/**
 * Stitch-style daily trend chart with input + output token areas.
 */
export function DualTrendChart({ data }: { data: DualPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="grad-input" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-output" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818CF8" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#818CF8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis
            {...axisProps}
            tickFormatter={(v: number) =>
              v >= 1_000_000
                ? (v / 1_000_000).toFixed(1) + "M"
                : v >= 1_000
                ? (v / 1_000).toFixed(0) + "K"
                : v.toFixed(0)
            }
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0F172A",
              border: "1px solid #1E293B",
              borderRadius: 8,
              fontSize: 12,
              color: "#dde4e5",
              fontFamily: "Inter",
            }}
            labelStyle={{ color: "#94A3B8" }}
            formatter={(value: number, name) => [
              value.toLocaleString(),
              name === "inputTokens" ? "Input" : "Output",
            ]}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{
              fontSize: 11,
              color: "#94A3B8",
              fontFamily: "Inter",
              paddingTop: 8,
            }}
            formatter={(v) => (v === "inputTokens" ? "Input" : "Output")}
          />
          <Area
            type="monotone"
            dataKey="inputTokens"
            stroke="#38BDF8"
            strokeWidth={2}
            fill="url(#grad-input)"
          />
          <Area
            type="monotone"
            dataKey="outputTokens"
            stroke="#818CF8"
            strokeWidth={2}
            fill="url(#grad-output)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Single-metric trend (cost or tokens). Used on smaller breakouts.
 */
export type TrendPoint = { date: string; tokens: number; cost: number };

export function TrendChart({
  data,
  metric,
}: {
  data: TrendPoint[];
  metric: "tokens" | "cost";
}) {
  const color = metric === "cost" ? "#22d3ee" : "#38BDF8";
  const id = `single-${metric}`;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis
            {...axisProps}
            tickFormatter={(v: number) =>
              metric === "cost"
                ? `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0)}`
                : v >= 1_000_000
                ? (v / 1_000_000).toFixed(1) + "M"
                : v >= 1_000
                ? (v / 1_000).toFixed(0) + "K"
                : v.toFixed(0)
            }
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0F172A",
              border: "1px solid #1E293B",
              borderRadius: 8,
              fontSize: 12,
              color: "#dde4e5",
              fontFamily: "Inter",
            }}
            labelStyle={{ color: "#94A3B8" }}
            formatter={(value: number) =>
              metric === "cost"
                ? [`$${value.toFixed(2)}`, "Cost"]
                : [value.toLocaleString(), "Tokens"]
            }
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
