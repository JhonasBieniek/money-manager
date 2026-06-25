import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import type { DashboardHistoryMonth } from "@money-manager/types";
import { motion } from "framer-motion";

const monthLabels = [
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

export function DashboardHistory() {
  const [history, setHistory] = useState<DashboardHistoryMonth[]>([]);
  const [period, setPeriod] = useState<"3" | "6" | "12">("3");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/v1/dashboard/history?period=${period}`);
        if (res.ok) {
          const data = (await res.json()) as { items: DashboardHistoryMonth[] };
          setHistory(data.items ?? []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [period]);

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
    }).format(cents / 100);
  }

  const maxValue = Math.max(
    ...history.map((h) => Math.max(h.incomes, h.expenses)),
    1,
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-64 w-full animate-pulse rounded-2xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {(["3", "6", "12"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-bold transition-all",
              period === p
                ? "bg-emerald-500 text-zinc-950"
                : "bg-white/5 text-zinc-400 hover:bg-white/10",
            )}
          >
            {p === "3" ? "3M" : p === "6" ? "6M" : "1A"}
          </button>
        ))}
      </div>

      <div className="glass rounded-[2.5rem] p-6">
        <h3 className="mb-6 text-lg font-bold text-white">
          Receitas vs Despesas
        </h3>

        <div className="mb-6 flex h-48 items-end justify-between gap-4">
          {history.map((h, i) => {
            const incomeHeight = (h.incomes / maxValue) * 100;
            const expenseHeight = (h.expenses / maxValue) * 100;

            return (
              <motion.div
                key={h.month}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-36 w-full items-end justify-center gap-1">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${incomeHeight}%` }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                    className="w-4 rounded-t-md bg-emerald-500"
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${expenseHeight}%` }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                    className="w-4 rounded-t-md bg-red-500"
                  />
                </div>
                <span className="text-xs text-zinc-500">
                  {monthLabels[h.monthNum - 1]}
                </span>
              </motion.div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-emerald-500" />
            <span className="text-zinc-400">Receitas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-red-500" />
            <span className="text-zinc-400">Despesas</span>
          </div>
        </div>
      </div>

      <div className="glass rounded-[2.5rem] p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Detalhamento</h3>
        <div className="space-y-3">
          {history
            .slice()
            .reverse()
            .map((h) => (
              <div
                key={h.month}
                className="flex items-center justify-between rounded-xl bg-white/5 p-3"
              >
                <div>
                  <span className="font-bold text-white">
                    {monthLabels[h.monthNum - 1]}
                  </span>
                  <span className="ml-2 text-xs text-zinc-500">{h.year}</span>
                </div>
                <div className="flex gap-6 text-sm">
                  <span className="font-mono text-emerald-400">
                    {formatCurrency(h.incomes)}
                  </span>
                  <span className="font-mono text-red-400">
                    {formatCurrency(h.expenses)}
                  </span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      h.balance >= 0 ? "text-white" : "text-red-400",
                    )}
                  >
                    {formatCurrency(h.balance)}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
