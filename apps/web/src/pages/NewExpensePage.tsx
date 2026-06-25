import { Link } from "react-router-dom";
import { ExpenseForm } from "../components/features/expenses/expense-form";
import { ArrowLeft } from "lucide-react";

export function NewExpensePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          to="/dashboard/expenses"
          className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-white">Nova despesa</h1>
        <p className="text-sm text-zinc-400">
          Registre um novo gasto no seu controle financeiro.
        </p>
      </div>

      <ExpenseForm />
    </div>
  );
}
