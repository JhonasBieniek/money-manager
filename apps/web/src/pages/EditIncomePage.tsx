import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Income } from "@money-manager/types";
import { IncomeForm } from "../components/features/incomes/income-form";
import { apiFetch } from "../lib/api";
import { ArrowLeft } from "lucide-react";

export function EditIncomePage() {
  const { id } = useParams<{ id: string }>();
  const [income, setIncome] = useState<Income | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch(`/v1/incomes/${id}`);
        if (!res.ok) throw new Error("Receita não encontrada");
        const data = (await res.json()) as Income;
        setIncome(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Receita não encontrada");
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

  if (error || !income) {
    return (
      <div className="mx-auto max-w-2xl text-red-400">
        Erro: {error ?? "Receita não encontrada"}
      </div>
    );
  }

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
        <h1 className="text-2xl font-bold text-white">Editar receita</h1>
        <p className="text-sm text-zinc-400">
          Alterar detalhes de {income.description}.
        </p>
      </div>

      <IncomeForm
        initialData={{
          id: income.id,
          amountCents: income.amountCents,
          description: income.description,
          source: income.source,
          tagIds: income.tagIds,
          occurredAt: income.occurredAt,
        }}
      />
    </div>
  );
}
