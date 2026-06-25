import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Expense } from "@money-manager/types";
import { ExpenseForm } from "../components/features/expenses/expense-form";
import { apiFetch } from "../lib/api";
import { ArrowLeft } from "lucide-react";

export function EditExpensePage() {
  const { id } = useParams<{ id: string }>();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`/v1/expenses/${id}`);
        if (!res.ok) throw new Error("Despesa não encontrada");
        const data = (await res.json()) as Expense;
        setExpense(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Despesa não encontrada");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto h-64 max-w-2xl animate-pulse rounded-xl bg-white/5" />
    );
  }

  if (error || !expense) {
    return (
      <div className="mx-auto max-w-2xl text-red-400">
        Erro: {error ?? "Despesa não encontrada"}
      </div>
    );
  }

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
        <h1 className="text-2xl font-bold text-white">Editar despesa</h1>
        <p className="text-sm text-zinc-400">
          Alterar detalhes de {expense.description}.
        </p>
      </div>

      <ExpenseForm
        initialData={{
          id: expense.id,
          amountCents: expense.amountCents,
          description: expense.description,
          goalCategory: expense.goalCategory,
          tagIds: expense.tagIds,
          occurredAt: expense.occurredAt,
          paymentMethod: expense.paymentMethod,
          cardLastFour: expense.cardLastFour,
        }}
      />
    </div>
  );
}
