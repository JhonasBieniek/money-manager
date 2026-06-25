import { Link } from "react-router-dom";
import { IncomeList } from "../components/features/incomes/income-list";
import { Plus, Sparkles, TrendingUp } from "lucide-react";

export function IncomesPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Entradas
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Receitas
          </h1>
          <p className="max-w-[50ch] text-zinc-400">
            Registre e acompanhe todas as suas fontes de renda.
          </p>
        </div>

        <Link
          to="/dashboard/incomes/new"
          className="flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-zinc-950 shadow-[0_20px_40px_-15px_rgba(255,255,255,0.1)] transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          Nova receita
        </Link>
      </div>

      <div className="glass rounded-[2rem] border-white/5 bg-zinc-900/20 p-8">
        <div className="mb-10 flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-emerald-500/50" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">
            Histórico de receitas
          </h2>
        </div>

        <IncomeList />
      </div>
    </div>
  );
}
