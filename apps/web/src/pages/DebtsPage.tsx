import { useCallback, useEffect, useState } from "react";
import type { DebtWithInstallments } from "@money-manager/types";
import { DebtCard } from "../components/features/debts/debt-card";
import { DebtFormModal } from "../components/features/debts/debt-form-modal";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import { Landmark, Plus } from "lucide-react";

export function DebtsPage() {
  const [items, setItems] = useState<DebtWithInstallments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DebtWithInstallments | null>(
    null,
  );

  const loadDebts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/v1/debts");
      if (!res.ok) throw new Error("Falha ao carregar dívidas");
      const data = (await res.json()) as { items: DebtWithInstallments[] };
      setItems(data.items ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDebts();
  }, [loadDebts]);

  function openCreateForm() {
    setEditingDebt(null);
    setFormOpen(true);
  }

  function openEditForm(debt: DebtWithInstallments) {
    setEditingDebt(debt);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingDebt(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta dívida?")) return;
    try {
      const res = await apiFetch(`/v1/debts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      void loadDebts();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const totalRemaining = items.reduce(
    (acc, item) => acc + item.remainingBalanceCents,
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Landmark className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Passivo
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Dívidas
          </h1>
          <p className="max-w-[50ch] text-zinc-400">
            Cadastre parcelamentos e acompanhe quanto ainda falta pagar. Parcelas
            lançadas nas despesas abatem o saldo automaticamente.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Nova dívida
        </button>
      </div>

      {items.length > 0 ? (
        <div className="glass rounded-2xl p-4 sm:rounded-3xl sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Saldo devedor total
          </p>
          <p className="font-mono text-2xl font-bold text-white">
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(totalRemaining / 100)}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-500">Carregando…</p>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center sm:rounded-3xl">
          <p className="text-zinc-400">Nenhuma dívida cadastrada ainda.</p>
          <button
            type="button"
            onClick={openCreateForm}
            className={cn(
              "mt-4 text-sm font-bold text-emerald-400 transition-colors hover:text-emerald-300",
            )}
          >
            Cadastrar primeira dívida
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          {items.map((item) => (
            <DebtCard
              key={item.id}
              debt={item}
              onEdit={openEditForm}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <DebtFormModal
        open={formOpen}
        debt={editingDebt}
        onClose={closeForm}
        onSaved={() => {
          closeForm();
          void loadDebts();
        }}
        onInstallmentToggled={() => void loadDebts()}
      />
    </div>
  );
}
