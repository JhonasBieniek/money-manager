import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import type { GoalUsageResponse, GoalWithUsage } from "@money-manager/types";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Target } from "lucide-react";

const categoryLabels: Record<string, string> = {
  "liberdade-financeira": "Liberdade Financeira",
  "custos-fixos": "Custos Fixos",
  conforto: "Conforto",
  metas: "Metas",
  prazeres: "Prazeres",
  conhecimento: "Conhecimento",
};

const categoryStyles: Record<
  string,
  { iconBg: string; iconText: string; accent: string }
> = {
  "liberdade-financeira": {
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-400",
    accent: "#10b981",
  },
  "custos-fixos": {
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-400",
    accent: "#3b82f6",
  },
  conforto: {
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-400",
    accent: "#f59e0b",
  },
  metas: {
    iconBg: "bg-purple-500/10",
    iconText: "text-purple-400",
    accent: "#a855f7",
  },
  prazeres: {
    iconBg: "bg-pink-500/10",
    iconText: "text-pink-400",
    accent: "#ec4899",
  },
  conhecimento: {
    iconBg: "bg-cyan-500/10",
    iconText: "text-cyan-400",
    accent: "#06b6d4",
  },
};

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function usageBarColor(usagePercent: number) {
  if (usagePercent < 80)
    return { text: "text-emerald-400", fill: "bg-emerald-500" };
  if (usagePercent <= 100)
    return { text: "text-amber-400", fill: "bg-amber-500" };
  return { text: "text-red-400", fill: "bg-red-500" };
}

function parsePercentage(goal: GoalWithUsage) {
  return typeof goal.percentage === "string"
    ? parseFloat(goal.percentage)
    : Number(goal.percentage);
}

interface GoalsUsagePanelProps {
  refreshToken?: number;
}

export function GoalsUsagePanel({ refreshToken = 0 }: GoalsUsagePanelProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<GoalWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      const res = await apiFetch(`/v1/goals/usage?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar uso das metas");
      const data = (await res.json()) as GoalUsageResponse;
      setItems(data.items);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar uso das metas",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage, refreshToken]);

  function goToPreviousMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
      return;
    }
    setMonth((m) => m - 1);
  }

  function goToNextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
      return;
    }
    setMonth((m) => m + 1);
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Uso do Mês</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPreviousMonth}
            aria-label="Mês anterior"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-bold text-zinc-300">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Próximo mês"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 w-full animate-pulse rounded-2xl bg-white/5"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nenhuma meta configurada para este período.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((goal, i) => {
            const styles = categoryStyles[goal.category] ?? categoryStyles.metas;
            const usageColor = usageBarColor(goal.usagePercent);
            const percentage = parsePercentage(goal);

            return (
              <motion.div
                key={goal.category}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="glass rounded-2xl p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        styles.iconBg,
                      )}
                    >
                      <Target className={cn("h-4 w-4", styles.iconText)} />
                    </div>
                    <span className="text-sm font-bold text-white">
                      {categoryLabels[goal.category] ?? goal.category}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">{percentage}%</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">
                      Teto: {formatCurrency(goal.ceiling)}
                    </span>
                    <span className={cn("font-bold", usageColor.text)}>
                      {goal.usagePercent}%
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">
                      Gasto: {formatCurrency(goal.spent)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(goal.usagePercent, 100)}%`,
                      }}
                      transition={{ delay: 0.2 + i * 0.05, duration: 0.5 }}
                      className={cn("h-full", usageColor.fill)}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}
