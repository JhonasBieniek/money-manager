import { Target } from "lucide-react";
import { GoalsForm } from "../components/features/goals/goals-form";

export function GoalsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Target className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Planejamento
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          Metas de Gastos
        </h1>
        <p className="max-w-[50ch] text-zinc-400">
          Defina a distribuição percentual das suas metas financeiras
        </p>
      </div>

      <div className="glass rounded-[2.5rem] p-8">
        <GoalsForm />
      </div>
    </div>
  );
}
