"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { Target, Check } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Goal {
  category: string;
  percentage: number;
  percentageValue: number;
  ceiling: number;
  spent: number;
  usagePercent: number;
}

type GoalRow = { category: string; percentage: number };

const DEFAULT_GOALS: GoalRow[] = [
  { category: "liberdade-financeira", percentage: 0 },
  { category: "custos-fixos", percentage: 0 },
  { category: "conforto", percentage: 0 },
  { category: "metas", percentage: 0 },
  { category: "prazeres", percentage: 0 },
  { category: "conhecimento", percentage: 0 },
];

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

function clampPercentage(value: number, goals: GoalRow[], category: string) {
  const otherTotal = goals.reduce(
    (acc, g) => (g.category === category ? acc : acc + g.percentage),
    0
  );
  const maxAllowed = 100 - otherTotal;
  const normalized = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.min(maxAllowed, Math.max(0, normalized));
}

function maxAllowedForCategory(goals: GoalRow[], category: string) {
  const otherTotal = goals.reduce(
    (acc, g) => (g.category === category ? acc : acc + g.percentage),
    0
  );
  return 100 - otherTotal;
}

export function GoalsForm() {
  const [goals, setGoals] = useState<GoalRow[]>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadGoals() {
      setLoading(true);
      try {
        const res = await apiFetch("/v1/goals");
        if (res.ok) {
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            const existingGoals = data.items.reduce(
              (acc: Record<string, number>, g: Goal) => {
                acc[g.category] =
                  typeof g.percentage === "string"
                    ? parseFloat(g.percentage)
                    : g.percentage;
                return acc;
              },
              {}
            );
            setGoals(
              DEFAULT_GOALS.map((g) => ({
                ...g,
                percentage: existingGoals[g.category] || 0,
              }))
            );
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void loadGoals();
  }, []);

  const totalPercentage = goals.reduce((acc, g) => acc + g.percentage, 0);
  const remaining = 100 - totalPercentage;

  function handlePercentageChange(category: string, value: number) {
    setGoals((prev) =>
      prev.map((g) =>
        g.category === category
          ? { ...g, percentage: clampPercentage(value, prev, category) }
          : g
      )
    );
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    if (totalPercentage !== 100) {
      setError(
        `A soma das metas deve ser exatamente 100%. Atualmente: ${totalPercentage}%`
      );
      setSaving(false);
      return;
    }

    try {
      const res = await apiFetch("/v1/goals", {
        method: "POST",
        body: JSON.stringify({ goals }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Erro ao salvar metas");
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar metas");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-24 w-full animate-pulse rounded-2xl bg-white/5"
          />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {error}
        </motion.div>
      ) : null}

      {success ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-400"
        >
          Metas salvas com sucesso!
        </motion.div>
      ) : null}

      <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-6">
        <div>
          <p className="text-sm font-bold text-zinc-400">Total Alocado</p>
          <p
            className={cn(
              "font-mono text-2xl font-bold",
              totalPercentage === 100 ? "text-emerald-400" : "text-amber-400"
            )}
          >
            {totalPercentage}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-zinc-400">Restante</p>
          <p
            className={cn(
              "font-mono text-2xl font-bold",
              remaining >= 0 ? "text-zinc-300" : "text-red-400"
            )}
          >
            {remaining}%
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {goals.map((goal, i) => {
          const styles = categoryStyles[goal.category];
          const maxAllowed = maxAllowedForCategory(goals, goal.category);

          return (
            <motion.div
              key={goal.category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group glass rounded-2xl p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl",
                      styles.iconBg
                    )}
                  >
                    <Target className={cn("h-5 w-5", styles.iconText)} />
                  </div>
                  <span className="font-bold text-white">
                    {categoryLabels[goal.category]}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    max={maxAllowed}
                    value={goal.percentage}
                    onChange={(e) =>
                      handlePercentageChange(
                        goal.category,
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    className="h-12 w-20 rounded-xl border border-white/5 bg-white/5 text-center text-xl font-bold text-white outline-none focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="font-bold text-zinc-500">%</span>
                </div>
              </div>

              <div className="relative flex h-7 w-full items-center">
                <div className="pointer-events-none absolute inset-x-0 h-2 rounded-full bg-white/5" />
                <div
                  className="pointer-events-none absolute left-0 h-2 rounded-full transition-[width] duration-150 ease-out"
                  style={{
                    width: `${goal.percentage}%`,
                    backgroundColor: styles.accent,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={goal.percentage}
                  onChange={(e) =>
                    handlePercentageChange(goal.category, parseInt(e.target.value, 10))
                  }
                  aria-label={`Porcentagem de ${categoryLabels[goal.category]}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={goal.percentage}
                  style={{ ["--thumb-color" as string]: styles.accent }}
                  className="relative z-10 h-7 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--thumb-color)] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--thumb-color)] [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.08)]"
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      <button
        type="submit"
        disabled={saving || totalPercentage !== 100}
        className="group relative flex h-16 w-full items-center justify-center gap-4 rounded-3xl bg-white text-lg font-black text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? (
          <span className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
            Salvando...
          </span>
        ) : (
          <>
            Salvar Metas
            <Check className="h-6 w-6 transition-transform group-hover:scale-125" />
          </>
        )}
      </button>
    </form>
  );
}
