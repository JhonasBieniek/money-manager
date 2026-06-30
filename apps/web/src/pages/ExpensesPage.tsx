import { ReceiptText, Sparkles } from "lucide-react";
import { ExpenseList } from "../components/features/expenses/expense-list";

export function ExpensesPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 sm:space-y-10">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <ReceiptText className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Gastos
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
          Despesas
        </h1>
        <p className="max-w-[50ch] text-zinc-400">
          Acompanhe e organize todos os seus gastos em um só lugar.
        </p>
      </div>

      <div className="glass rounded-2xl border-white/5 bg-zinc-900/20 p-4 sm:rounded-[2rem] sm:p-6 lg:p-8">
        <div className="mb-6 flex items-center gap-3 sm:mb-10">
          <Sparkles className="h-5 w-5 text-emerald-500/50" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">
            Histórico de despesas
          </h2>
        </div>

        <ExpenseList />
      </div>
    </div>
  );
}
