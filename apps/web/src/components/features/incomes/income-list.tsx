import { useCallback, useEffect, useState } from "react";
import type { Income } from "@money-manager/types";
import { formatOccurredAtPtBr } from "@money-manager/utils/date";
import { useTransactionModals } from "../../providers/transaction-modals";
import { TransactionListFiltersBar } from "../transactions/transaction-list-filters";
import { apiFetch } from "../../../lib/api";
import {
  filtersToSearchParams,
  formatFilterPeriodLabel,
  type TransactionListFilters,
} from "../../../lib/transaction-list-filters";
import { Edit3, Filter, Trash2 } from "lucide-react";

const SOURCE_LABELS: Record<string, string> = {
  salary: "Salário",
  freelance: "Freelance",
  investment: "Investimento",
  gift: "Presente",
  other: "Outros",
};

const PAGE_SIZE = 20;

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(dateStr: string) {
  return formatOccurredAtPtBr(dateStr);
}

export function IncomeList() {
  const { refreshToken, openIncomeEditModal } = useTransactionModals();
  const [filters, setFilters] = useState<TransactionListFilters | null>(null);
  const [offset, setOffset] = useState(0);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmountCents, setTotalAmountCents] = useState(0);
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
      const res = await apiFetch(`/v1/incomes?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar receitas");
      const data = (await res.json()) as {
        items: Income[];
        meta: { total: number; totalAmountCents: number };
      };
      setIncomes(data.items);
      setTotal(data.meta.total);
      setTotalAmountCents(data.meta.totalAmountCents ?? 0);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar receitas",
      );
    } finally {
      setLoading(false);
    }
  }, [filters, offset, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta receita?")) return;
    try {
      const res = await apiFetch(`/v1/incomes/${id}`, { method: "DELETE" });
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

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {total} {total === 1 ? "receita" : "receitas"}
          {filters ? (
            <span className="text-zinc-600">
              {" "}
              · {formatFilterPeriodLabel(filters.month, filters.year)}
            </span>
          ) : null}
        </p>
        <p className="text-sm text-zinc-400">
          Total recebido:{" "}
          <span className="font-mono font-semibold text-emerald-400">
            {formatCurrency(totalAmountCents)}
          </span>
        </p>
      </div>

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
      ) : incomes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-white/5 py-24 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
            <Filter className="h-8 w-8 text-zinc-700" />
          </div>
          <h3 className="mb-2 text-xl font-bold text-white">Sem receitas</h3>
          <p className="max-w-[30ch] text-sm text-zinc-500">
            Nenhuma receita encontrada para os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {incomes.map((income) => {
            const dateParts = formatDate(income.occurredAt).split(" ");
            return (
              <div
                key={income.id}
                className="group glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6"
              >
                <div className="flex min-w-0 items-start gap-3 sm:contents">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 transition-colors group-hover:bg-emerald-500/10 group-hover:text-emerald-400 sm:h-12 sm:w-12 sm:rounded-2xl">
                    <span className="text-[10px] font-bold uppercase tracking-tighter">
                      {dateParts[1]}
                    </span>
                    <span className="text-base font-bold leading-none sm:text-lg">
                      {dateParts[0]}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-base font-bold text-white sm:text-lg">
                      {income.description}
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500 sm:gap-3">
                      <span className="flex max-w-full items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-xs">
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span className="truncate">
                          {SOURCE_LABELS[income.source] ?? income.source}
                        </span>
                      </span>
                      {income.tagIds && income.tagIds.length > 0 ? (
                        <span className="text-xs">
                          {income.tagIds.length} tag
                          {income.tagIds.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <p className="shrink-0 font-mono text-lg font-bold text-emerald-400 sm:text-right sm:text-xl">
                    {formatCurrency(income.amountCents)}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-3 sm:ml-4 sm:border-0 sm:pt-0 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => openIncomeEditModal(income.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-zinc-400 transition-all hover:bg-white/10 hover:text-white"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(income.id)}
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
