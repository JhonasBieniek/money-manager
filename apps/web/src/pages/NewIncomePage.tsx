import { Link } from "react-router-dom";
import { IncomeForm } from "../components/features/incomes/income-form";
import { ArrowLeft } from "lucide-react";

export function NewIncomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          to="/dashboard/incomes"
          className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold text-white">Nova receita</h1>
        <p className="text-sm text-zinc-400">
          Registre uma nova entrada no seu controle financeiro.
        </p>
      </div>

      <IncomeForm />
    </div>
  );
}
