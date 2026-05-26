import { GoalsForm } from "@/components/features/goals/goals-form";

export default function GoalsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">
          Metas de Gastos
        </h1>
        <p className="text-zinc-400">
          Defina a distribuição percentual das suas metas financeiras
        </p>
      </div>

      <div className="glass p-8 rounded-[2.5rem]">
        <GoalsForm />
      </div>
    </div>
  );
}
