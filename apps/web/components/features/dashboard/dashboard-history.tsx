"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";

interface HistoryMonth {
  month: string;
  year: number;
  monthNum: number;
  incomes: number;
  expenses: number;
  balance: number;
}

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
  const [history, setHistory] = useState<HistoryMonth[]>([]);
  const [period, setPeriod] = useState<"3" | "6" | "12">("3");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch(`/v1/dashboard/history?period=${period}`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data.items || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
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
    1
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
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              period === p
                ? "bg-emerald-500 text-zinc-950"
                : "bg-white/5 text-zinc-400 hover:bg-white/10"
            }`}
          >
            {p === "3" ? "3M" : p === "6" ? "6M" : "1A"}
          </button>
        ))}
      </div>

      <div className="glass p-6 rounded-[2.5rem]">
        <h3 className="text-lg font-bold text-white mb-6">
          Receitas vs Despesas
        </h3>

        <div className="flex items-end justify-between gap-4 h-48 mb-6">
          {history.map((h, i) => {
            const incomeHeight = (h.incomes / maxValue) * 100;
            const expenseHeight = (h.expenses / maxValue) * 100;

            return (
              <motion.div
                key={h.month}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex-1 flex flex-col items-center gap-2"
              >
                <div className="w-full flex gap-1 justify-center h-36 items-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${incomeHeight}%` }}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                    className="w-4 bg-emerald-500 rounded-t-md"
                  />
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${expenseHeight}%` }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                    className="w-4 bg-red-500 rounded-t-md"
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
            <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
            <span className="text-zinc-400">Receitas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-sm" />
            <span className="text-zinc-400">Despesas</span>
          </div>
        </div>
      </div>

      <div className="glass p-6 rounded-[2.5rem]">
        <h3 className="text-lg font-bold text-white mb-4">Detalhamento</h3>
        <div className="space-y-3">
          {history
            .slice()
            .reverse()
            .map((h) => (
              <div
                key={h.month}
                className="flex items-center justify-between p-3 rounded-xl bg-white/5"
              >
                <div>
                  <span className="font-bold text-white">
                    {monthLabels[h.monthNum - 1]}
                  </span>
                  <span className="text-xs text-zinc-500 ml-2">{h.year}</span>
                </div>
                <div className="flex gap-6 text-sm">
                  <span className="text-emerald-400 font-mono">
                    {formatCurrency(h.incomes)}
                  </span>
                  <span className="text-red-400 font-mono">
                    {formatCurrency(h.expenses)}
                  </span>
                  <span
                    className={`font-mono font-bold ${h.balance >= 0 ? "text-white" : "text-red-400"}`}
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
