import { useEffect, useState } from "react";
import type { BenchmarkComparison } from "@money-manager/types";
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
  { value: "year", label: "Ano" },
  { value: "12m", label: "12M" },
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

interface ChartPoint {
  referenceMonth: string;
  patrimonyAccumulatedPct: number | null;
  ipcaAccumulatedPct: number | null;
  cdiAccumulatedPct: number | null;
}

function formatPct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function formatMonthLabel(monthStr: string) {
  const [year, month] = monthStr.split("-");
  const monthLabel = MONTH_LABELS[Number(month) - 1];
  if (!year || !monthLabel) return monthStr;
  return `${monthLabel}/${year.slice(2)}`;
}

export function BenchmarkComparisonChart() {
  const [period, setPeriod] = useState("year");
  const [comparison, setComparison] = useState<BenchmarkComparison | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/v1/patrimony/benchmarks?period=${period}`);
        if (res.ok) {
          setComparison((await res.json()) as BenchmarkComparison);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [period]);

  const chartData: ChartPoint[] = (comparison?.series ?? []).map((point) => ({
    referenceMonth: point.referenceMonth,
    patrimonyAccumulatedPct:
      point.patrimonyIndexed === null ? null : point.patrimonyIndexed - 100,
    ipcaAccumulatedPct: point.ipcaAccumulatedPct,
    cdiAccumulatedPct: point.cdiAccumulatedPct,
  }));

  return (
    <div className="glass rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-white sm:text-lg">
            Patrimônio vs IPCA/CDI
          </h3>
          <p className="text-xs text-zinc-500">
            Informativo — não é recomendação de investimento.
          </p>
        </div>
        <PatrimonyPeriodSelector
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {loading ? (
        <div className="h-56 w-full animate-pulse rounded-2xl bg-white/5" />
      ) : chartData.length < 2 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm text-zinc-500">
          Ainda não há histórico suficiente.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={224}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis
                dataKey="referenceMonth"
                tickFormatter={formatMonthLabel}
                stroke="#71717a"
                fontSize={12}
              />
              <YAxis
                stroke="#71717a"
                fontSize={12}
                width={50}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const point = payload[0].payload as ChartPoint;
                  return (
                    <div className="glass rounded-xl px-3 py-2 text-xs text-white">
                      <p className="font-bold">
                        {formatMonthLabel(point.referenceMonth)}
                      </p>
                      <p className="text-emerald-400">
                        Patrimônio: {formatPct(point.patrimonyAccumulatedPct)}
                      </p>
                      <p className="text-blue-400">
                        IPCA: {formatPct(point.ipcaAccumulatedPct)}
                      </p>
                      <p className="text-amber-400">
                        CDI: {formatPct(point.cdiAccumulatedPct)}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="patrimonyAccumulatedPct"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="ipcaAccumulatedPct"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="cdiAccumulatedPct"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-emerald-500" />
              <span className="text-zinc-400">Patrimônio</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-blue-400" />
              <span className="text-zinc-400">IPCA acumulado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-amber-500" />
              <span className="text-zinc-400">CDI acumulado</span>
            </div>
          </div>
          {comparison && comparison.portfolioReturnPct !== null ? (
            <p className="mt-3 text-center text-sm text-zinc-400">
              Carteira {comparison.portfolioReturnPct.toFixed(2)}% vs CDI{" "}
              {comparison.cdiReturnPct !== null
                ? `${comparison.cdiReturnPct.toFixed(2)}%`
                : "—"}{" "}
              no período
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
