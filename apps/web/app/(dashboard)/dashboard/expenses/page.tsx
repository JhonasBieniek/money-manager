import { ExpenseList } from "@/components/features/expenses/expense-list";

export default function ExpensesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-10 lg:px-10 lg:py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Despesas
        </h1>
        <p className="text-sm text-zinc-500">
          Acompanhe e gerencie todos os seus gastos.
        </p>
      </div>

      <ExpenseList />
    </div>
  );
}
