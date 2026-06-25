import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import type { DashboardSummary } from "@money-manager/types";
import { GOAL_CATEGORY_LABELS } from "@money-manager/types";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Target,
  TrendingUp,
} from "lucide-react";

const categoryStyles: Record<
  string,
  { iconBg: string; iconText: string }
> = {
  "liberdade-financeira": {
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-400",
  },
  "custos-fixos": {
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-400",
  },
  conforto: {
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-400",
  },
  metas: {
    iconBg: "bg-purple-500/10",
    iconText: "text-purple-400",
  },
  prazeres: {
    iconBg: "bg-pink-500/10",
    iconText: "text-pink-400",
  },
  conhecimento: {
    iconBg: "bg-cyan-500/10",
    iconText: "text-cyan-400",
  },
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function usageBarColor(usagePercent: number) {
  if (usagePercent < 80) {
    return { text: "text-emerald-400", fill: "bg-emerald-500" };
  }
  if (usagePercent <= 100) {
    return { text: "text-amber-400", fill: "bg-amber-500" };
  }
  return { text: "text-red-400", fill: "bg-red-500" };
}

export function DashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary>({
    totalIncomes: 0,
    totalExpenses: 0,
    balance: 0,
    expensesByCategory: [],
    goalsUsage: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const res = await apiFetch(
          `/v1/dashboard/summary?year=${year}&month=${month}`,
        );
        if (res.ok) {
          const data = (await res.json()) as DashboardSummary;
          setSummary(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 w-full animate-pulse rounded-3xl bg-white/5"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-2xl bg-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  const balanceIsPositive = summary.balance >= 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, duration: 0.5 }}
          className="glass group relative overflow-hidden rounded-[2.5rem] p-6"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Receitas
              </p>
              <h3 className="font-mono text-2xl font-bold tracking-tight text-white">
                {formatCurrency(summary.totalIncomes)}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <ArrowUpRight className="h-5 w-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="glass group relative overflow-hidden rounded-[2.5rem] p-6"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Despesas
              </p>
              <h3 className="font-mono text-2xl font-bold tracking-tight text-white">
                {formatCurrency(summary.totalExpenses)}
              </h3>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
              <ArrowDownRight className="h-5 w-5" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className={cn(
            "glass group relative overflow-hidden rounded-[2.5rem] p-6",
            balanceIsPositive ? "border-emerald-500/20" : "border-red-500/20",
          )}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Saldo
              </p>
              <h3
                className={cn(
                  "font-mono text-2xl font-bold tracking-tight",
                  balanceIsPositive ? "text-emerald-400" : "text-red-400",
                )}
              >
                {formatCurrency(summary.balance)}
              </h3>
            </div>
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                balanceIsPositive
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400",
              )}
            >
              <TrendingUp
                className={cn("h-5 w-5", !balanceIsPositive && "rotate-180")}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {summary.expensesByCategory.length > 0 ? (
        <div>
          <h2 className="mb-4 text-lg font-bold text-white">
            Despesas por Categoria
          </h2>
          <div className="glass rounded-[2rem] p-6">
            <div className="space-y-3">
              {summary.expensesByCategory.map((item) => (
                <div
                  key={item.category}
                  className="flex items-center justify-between rounded-xl bg-white/5 p-3"
                >
                  <span className="text-sm font-medium text-zinc-200">
                    {item.category}
                  </span>
                  <span className="font-mono text-sm text-red-400">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {summary.goalsUsage.length > 0 ? (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Metas do Mês</h2>
            <Link
              to="/dashboard/goals"
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              Configurar →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summary.goalsUsage.map((goal, i) => {
              const styles =
                categoryStyles[goal.category] ?? categoryStyles.metas;
              const usageColor = usageBarColor(goal.usagePercent);

              return (
                <motion.div
                  key={goal.category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.05, duration: 0.4 }}
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
                        {GOAL_CATEGORY_LABELS[goal.category] ?? goal.category}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {goal.percentage}%
                    </span>
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
                        transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                        className={cn("h-full", usageColor.fill)}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
