import { IncomeList } from "@/components/features/incomes/income-list";

export default function IncomesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-10 lg:px-10 lg:py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Receitas
        </h1>
        <p className="text-sm text-zinc-500">
          Gerencie suas receitas e entradas de dinheiro.
        </p>
      </div>

      <IncomeList />
    </div>
  );
}
