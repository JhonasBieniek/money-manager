"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import Link from "next/link";

interface GoalUsage {
  category: string;
  percentage: number;
  ceiling: number;
  spent: number;
  usagePercent: number;
}

const categoryLabels: Record<string, string> = {
  "liberdade-financeira": "Liberdade Financeira",
  "custos-fixos": "Custos Fixos",
  conforto: "Conforto",
  metas: "Metas",
  prazeres: "Prazeres",
  conhecimento: "Conhecimento",
};

const categoryColors: Record<string, string> = {
  "liberdade-financeira": "emerald",
  "custos-fixos": "blue",
  conforto: "amber",
  metas: "purple",
  prazeres: "pink",
  conhecimento: "cyan",
};

export function DashboardSummary() {
  const [summary, setSummary] = useState({
    totalIncomes: 0,
    totalExpenses: 0,
    balance: 0,
    goalsUsage: [] as GoalUsage[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const res = await apiFetch(
          `/v1/dashboard/summary?year=${year}&month=${month}`
        );
        if (res.ok) {
          const data = await res.json();
          setSummary(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  }

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
          className="glass group relative overflow-hidden p-6 rounded-[2.5rem]"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Receitas
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-white font-mono">
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
          className="glass group relative overflow-hidden p-6 rounded-[2.5rem]"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Despesas
              </p>
              <h3 className="text-2xl font-bold tracking-tight text-white font-mono">
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
          className={`glass group relative overflow-hidden p-6 rounded-[2.5rem] ${balanceIsPositive ? "border-emerald-500/20" : "border-red-500/20"}`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Saldo
              </p>
              <h3
                className={`text-2xl font-bold tracking-tight font-mono ${balanceIsPositive ? "text-emerald-400" : "text-red-400"}`}
              >
                {formatCurrency(summary.balance)}
              </h3>
            </div>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${balanceIsPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
            >
              {balanceIsPositive ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingUp className="h-5 w-5 rotate-180" />
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {summary.goalsUsage.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Metas do Mês</h2>
            <Link
              href="/dashboard/goals"
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              Configurar →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {summary.goalsUsage.map((goal, i) => {
              const usageColor =
                goal.usagePercent < 80
                  ? "emerald"
                  : goal.usagePercent <= 100
                    ? "amber"
                    : "red";
              return (
                <motion.div
                  key={goal.category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.05, duration: 0.4 }}
                  className="glass p-5 rounded-2xl"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg bg-${categoryColors[goal.category]}-500/10`}
                      >
                        <Target
                          className={`h-4 w-4 text-${categoryColors[goal.category]}-400`}
                        />
                      </div>
                      <span className="text-sm font-bold text-white">
                        {categoryLabels[goal.category]}
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
                      <span className={`text-${usageColor}-400 font-bold`}>
                        {goal.usagePercent}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(goal.usagePercent, 100)}%`,
                        }}
                        transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                        className={`h-full bg-${usageColor}-500`}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
