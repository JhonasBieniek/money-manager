import { useEffect, useState } from "react";
import type { PatrimonyHistoryPoint } from "@money-manager/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../../../../lib/api";
import { PatrimonyPeriodSelector } from "./patrimony-period-selector.js";

const PERIOD_OPTIONS = [
  { value: "3", label: "3M" },
  { value: "6", label: "6M" },
  { value: "12", label: "1A" },
  { value: "24", label: "2A" },
];

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDateLabel(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  const monthLabel = MONTH_LABELS[Number(month) - 1];
  if (!year || !monthLabel || !day) return dateStr;
  return `${day}/${monthLabel}/${year.slice(2)}`;
}

interface PatrimonyEvolutionChartProps {
  refreshKey?: number;
}

export function PatrimonyEvolutionChart({
  refreshKey,
}: PatrimonyEvolutionChartProps) {
  const [period, setPeriod] = useState("3");
  const [points, setPoints] = useState<PatrimonyHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/v1/patrimony/history?period=${period}`);
        if (res.ok) {
          const data = (await res.json()) as {
            items: PatrimonyHistoryPoint[];
          };
          setPoints(data.items ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [period, refreshKey]);

  return (
    <div className="glass rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-white sm:text-lg">
          Evolução do patrimônio
        </h3>
        <PatrimonyPeriodSelector
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {loading ? (
        <div className="h-56 w-full animate-pulse rounded-2xl bg-white/5" />
      ) : points.length < 2 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm text-zinc-500">
          Ainda não há histórico suficiente.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <LineChart data={points}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis
              dataKey="snapshotDate"
              tickFormatter={formatDateLabel}
              stroke="#71717a"
              fontSize={12}
            />
            <YAxis
              tickFormatter={(v: number) => formatCurrency(v)}
              stroke="#71717a"
              fontSize={12}
              width={80}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const point = payload[0].payload as PatrimonyHistoryPoint;
                return (
                  <div className="glass rounded-xl px-3 py-2 text-xs text-white">
                    <p className="font-bold">{point.snapshotDate}</p>
                    <p className="text-zinc-400">
                      {formatCurrency(point.totalAssetsCents)}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="totalAssetsCents"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
