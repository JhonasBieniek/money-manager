import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Expense } from "@money-manager/types";
import { GOAL_CATEGORY_LABELS } from "@money-manager/types";
import { TransactionListFiltersBar } from "../transactions/transaction-list-filters";
import { apiFetch } from "../../../lib/api";
import {
  filtersToSearchParams,
  type TransactionListFilters,
} from "../../../lib/transaction-list-filters";
import { Edit3, Filter, Trash2 } from "lucide-react";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  credit_card: "Cartão",
  debit_card: "Débito",
  pix: "PIX",
  bank_transfer: "Transferência",
  other: "Outro",
};

const PAGE_SIZE = 20;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(dateStr));
}

export function ExpenseList() {
  const [filters, setFilters] = useState<TransactionListFilters | null>(null);
  const [offset, setOffset] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleFiltersChange = useCallback((next: TransactionListFilters) => {
    setOffset(0);
    setFilters(next);
  }, []);

  const load = useCallback(async () => {
    if (!filters) return;

    setLoading(true);
    setError(null);
    try {
      const params = filtersToSearchParams(filters);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await apiFetch(`/v1/expenses?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar despesas");
      const data = (await res.json()) as {
        items: Expense[];
        meta: { total: number };
      };
      setExpenses(data.items);
      setTotal(data.meta.total);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar despesas",
      );
    } finally {
      setLoading(false);
    }
  }, [filters, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    try {
      const res = await apiFetch(`/v1/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      void load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-8">
      <TransactionListFiltersBar onFiltersChange={handleFiltersChange} />

      <p className="text-sm text-zinc-500">
        {total} {total === 1 ? "despesa" : "despesas"}
      </p>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          Erro: {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded-2xl bg-white/5"
            />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-white/5 py-24 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
            <Filter className="h-8 w-8 text-zinc-700" />
          </div>
          <h3 className="mb-2 text-xl font-bold text-white">Sem despesas</h3>
          <p className="max-w-[30ch] text-sm text-zinc-500">
            Nenhuma despesa encontrada para os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {expenses.map((expense) => {
            const dateParts = formatDate(expense.occurredAt).split(" ");
            return (
              <div
                key={expense.id}
                className="group glass flex items-center gap-6 rounded-2xl p-6 transition-all hover:border-white/10 hover:bg-white/5"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400 transition-colors group-hover:bg-emerald-500/10 group-hover:text-emerald-400">
                  <span className="text-[10px] font-bold uppercase tracking-tighter">
                    {dateParts[1]}
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {dateParts[0]}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-lg font-bold text-white">
                    {expense.description}
                  </h4>
                  <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500">
                    <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {GOAL_CATEGORY_LABELS[expense.goalCategory]}
                    </span>
                    {expense.tagIds && expense.tagIds.length > 0 ? (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="hidden text-xs sm:inline">
                          {expense.tagIds.length} tag
                          {expense.tagIds.length === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : null}
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline">
                      {PAYMENT_LABELS[expense.paymentMethod] ??
                        expense.paymentMethod}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-mono text-xl font-bold text-white">
                    {formatCurrency(expense.amountCents)}
                  </p>
                </div>

                <div className="ml-4 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Link
                    to={`/dashboard/expenses/${expense.id}/edit`}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-zinc-400 transition-all hover:bg-white/10 hover:text-white"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleDelete(expense.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/5 text-red-400/70 transition-all hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-zinc-500">
            Página {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      ) : null}
    </div>
  );
}
