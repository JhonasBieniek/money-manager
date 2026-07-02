import { cn } from "../../../lib/cn";

const months = [
  { label: "Jan", income: 72, expense: 58 },
  { label: "Fev", income: 65, expense: 61 },
  { label: "Mar", income: 88, expense: 70 },
];

export function OnboardingHistoryPreview() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="flex items-center gap-2">
        {["3M", "6M", "1A"].map((period, index) => (
          <span
            key={period}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-bold",
              index === 0
                ? "bg-emerald-500/80 text-zinc-950"
                : "bg-white/5 text-zinc-500",
            )}
          >
            {period}
          </span>
        ))}
      </div>

      <div className="glass rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6">
        <h3 className="mb-4 text-base font-bold text-white/90 sm:mb-6 sm:text-lg">
          Receitas vs Despesas
        </h3>

        <div className="mb-4 flex h-40 items-end justify-between gap-2 sm:mb-6 sm:h-48 sm:gap-4">
          {months.map((month) => (
            <div
              key={month.label}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-28 w-full items-end justify-center gap-1 sm:h-36">
                <div
                  className="w-4 rounded-t-md bg-emerald-500/70"
                  style={{ height: `${month.income}%` }}
                />
                <div
                  className="w-4 rounded-t-md bg-red-500/60"
                  style={{ height: `${month.expense}%` }}
                />
              </div>
              <span className="text-xs text-zinc-600">{month.label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-sm sm:gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-emerald-500/70" />
            <span className="text-zinc-500">Receitas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-red-500/60" />
            <span className="text-zinc-500">Despesas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
