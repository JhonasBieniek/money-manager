import type { DashboardSummary } from "@money-manager/types";
import { GOAL_CATEGORY_LABELS } from "@money-manager/types";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar as CalendarIcon,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import { formatFilterPeriodLabel, getCurrentMonthYear } from "../../../lib/transaction-list-filters";

const categoryStyles: Record<string, { iconBg: string; iconText: string }> = {
  "custos-fixos": { iconBg: "bg-blue-500/10", iconText: "text-blue-400" },
  conforto: { iconBg: "bg-amber-500/10", iconText: "text-amber-400" },
  metas: { iconBg: "bg-purple-500/10", iconText: "text-purple-400" },
  prazeres: { iconBg: "bg-pink-500/10", iconText: "text-pink-400" },
};

const mockSummary: DashboardSummary = {
  totalIncomes: 1_284_000,
  totalExpenses: 823_050,
  balance: 460_950,
  expensesByCategory: [],
  goalsUsage: [
    {
      category: "custos-fixos",
      percentage: 35,
      ceiling: 350_000,
      spent: 238_000,
      usagePercent: 68,
    },
    {
      category: "conforto",
      percentage: 25,
      ceiling: 250_000,
      spent: 210_000,
      usagePercent: 84,
    },
    {
      category: "metas",
      percentage: 20,
      ceiling: 200_000,
      spent: 82_000,
      usagePercent: 41,
    },
    {
      category: "prazeres",
      percentage: 10,
      ceiling: 100_000,
      spent: 93_050,
      usagePercent: 93,
    },
  ],
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

export function OnboardingDashboardPreview() {
  const { month, year } = getCurrentMonthYear();
  const periodLabel = formatFilterPeriodLabel(month, year);
  const balanceIsPositive = mockSummary.balance >= 0;

  return (
    <div className="space-y-8" aria-hidden>
      <div className="max-w-2xl">
        <div className="mb-3 flex items-center gap-2 sm:mb-4">
          <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
            Prévia ilustrativa
          </span>
        </div>
        <h1 className="mb-3 text-2xl font-bold tracking-tight text-white/90 sm:mb-4 sm:text-4xl md:text-5xl">
          Seu painel financeiro
        </h1>
        <p className="text-base text-zinc-500 sm:text-lg">
          Assim fica o resumo quando você começar a registrar movimentações.
        </p>
      </div>

      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-600">
            Resumo de{" "}
            <span className="font-medium text-zinc-500">{periodLabel}</span>
          </p>
          <div className="flex h-11 w-full max-w-xs items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] px-3 sm:h-12 sm:px-4">
            <CalendarIcon className="h-4 w-4 shrink-0 text-zinc-600" />
            <span className="text-sm text-zinc-500">{periodLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          <div className="glass rounded-3xl p-5 sm:rounded-[2.5rem] sm:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Receitas
                </p>
                <h3 className="font-mono text-2xl font-bold tracking-tight text-white">
                  {formatCurrency(mockSummary.totalIncomes)}
                </h3>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                <ArrowUpRight className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="glass rounded-3xl p-5 sm:rounded-[2.5rem] sm:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Despesas
                </p>
                <h3 className="font-mono text-2xl font-bold tracking-tight text-white">
                  {formatCurrency(mockSummary.totalExpenses)}
                </h3>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
                <ArrowDownRight className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "glass rounded-3xl p-5 sm:rounded-[2.5rem] sm:p-6",
              balanceIsPositive ? "border-emerald-500/20" : "border-red-500/20",
            )}
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Saldo
                </p>
                <h3 className="font-mono text-2xl font-bold tracking-tight text-emerald-400">
                  {formatCurrency(mockSummary.balance)}
                </h3>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-bold text-white/90">
            Metas de {periodLabel}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mockSummary.goalsUsage.map((goal) => {
              const styles = categoryStyles[goal.category] ?? categoryStyles.metas;
              const usageColor = usageBarColor(goal.usagePercent);

              return (
                <div key={goal.category} className="glass rounded-2xl p-5">
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
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                      <div
                        className={cn("h-full", usageColor.fill)}
                        style={{
                          width: `${Math.min(goal.usagePercent, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
