import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreditCard, CreditCardWithCurrentStatement } from "@money-manager/types";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import { useSelectedPeriod } from "../contexts/period-context";
import {
  MONTH_OPTIONS,
  buildYearOptions,
  formatFilterPeriodLabel,
} from "../lib/transaction-list-filters";
import { FilterSelect } from "../components/ui/filter-select";
import { CreditCardFormModal } from "../components/features/credit-cards/credit-card-form-modal";
import { StatementCard } from "../components/features/credit-cards/statement-card";
import { Calendar as CalendarIcon, CreditCard as CreditCardIcon, Plus } from "lucide-react";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function CreditCardsPage() {
  const {
    month: sharedMonth,
    year: sharedYear,
    periodTouched,
    setPeriod,
  } = useSelectedPeriod();
  const [autoMonth, setAutoMonth] = useState(sharedMonth);
  const [autoYear, setAutoYear] = useState(sharedYear);
  const month = periodTouched ? sharedMonth : autoMonth;
  const year = periodTouched ? sharedYear : autoYear;
  const [items, setItems] = useState<CreditCardWithCurrentStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);

  const monthOptions = useMemo(
    () =>
      MONTH_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [],
  );

  const yearOptions = useMemo(
    () =>
      buildYearOptions().map((y) => ({
        value: String(y),
        label: String(y),
      })),
    [],
  );

  const accumulatedTotalCents = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (!item.currentStatement) {
          return sum;
        }
        const effectiveTotal =
          item.currentStatement.adjustedTotalCents ??
          item.currentStatement.calculatedTotalCents;
        return sum + effectiveTotal;
      }, 0),
    [items],
  );

  const distinctStatementCycles = useMemo(() => {
    const cycles = new Set<string>();
    items.forEach((item) => {
      if (item.currentStatement) {
        cycles.add(`${item.currentStatement.cycleYear}-${item.currentStatement.cycleMonth}`);
      }
    });
    return cycles;
  }, [items]);

  const hasAnyCurrentStatement = useMemo(
    () => items.some((item) => item.currentStatement),
    [items],
  );

  const periodLabel = formatFilterPeriodLabel(month, year);

  const bannerPeriodLabel =
    periodTouched || distinctStatementCycles.size <= 1
      ? periodLabel
      : "Faturas atuais";

  const loadStatements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = periodTouched
        ? `/v1/credit-cards/statements/current?month=${month}&year=${year}`
        : "/v1/credit-cards/statements/current";
      const res = await apiFetch(path);
      if (!res.ok) throw new Error("Falha ao carregar faturas");
      const data = (await res.json()) as { items: CreditCardWithCurrentStatement[] };
      setItems(data.items ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [month, year, periodTouched]);

  useEffect(() => {
    if (periodTouched || items.length === 0) {
      return;
    }

    const statement = items.find((item) => item.currentStatement)?.currentStatement;
    if (!statement) {
      return;
    }

    const cycleMonth = String(statement.cycleMonth);
    const cycleYear = String(statement.cycleYear);
    if (autoMonth !== cycleMonth || autoYear !== cycleYear) {
      setAutoMonth(cycleMonth);
      setAutoYear(cycleYear);
    }
  }, [items, periodTouched, autoMonth, autoYear]);

  useEffect(() => {
    void loadStatements();
  }, [loadStatements]);

  function openCreate() {
    setEditingCard(null);
    setFormOpen(true);
  }

  function openEdit(card: CreditCard) {
    setEditingCard(card);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <CreditCardIcon className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Crédito
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Cartões e Faturas
          </h1>
          <p className="max-w-[50ch] text-zinc-400">
            Acompanhe a fatura de cada cartão, feche faturas e ajuste totais
            conforme o extrato do banco.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Novo cartão
        </button>
      </div>

      <div className="flex h-12 items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-3 sm:h-14 sm:gap-3 sm:px-4">
        <CalendarIcon className="h-4 w-4 shrink-0 text-zinc-500" />
        <FilterSelect
          value={month}
          onChange={(value) => setPeriod(value, year)}
          options={monthOptions}
          ariaLabel="Mês"
        />
        <span className="text-zinc-700">/</span>
        <FilterSelect
          value={year}
          onChange={(value) => setPeriod(month, value)}
          options={yearOptions}
          ariaLabel="Ano"
          className="max-w-[5.5rem]"
        />
      </div>

      {!loading && !error && hasAnyCurrentStatement ? (
        <div className="glass flex items-center justify-between rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Total de faturas · {bannerPeriodLabel}
            </p>
            <p
              className="mt-1 text-2xl font-bold text-white"
              data-testid="cards-accumulated-total"
            >
              {formatCurrency(accumulatedTotalCents)}
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <CreditCardIcon className="h-5 w-5" />
          </div>
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
          <p className="text-zinc-400">Nenhum cartão cadastrado ainda.</p>
          <button
            type="button"
            onClick={openCreate}
            className={cn(
              "mt-4 text-sm font-bold text-emerald-400 transition-colors hover:text-emerald-300",
            )}
          >
            Cadastrar primeiro cartão
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          {items.map((item) => (
            <StatementCard
              key={item.id}
              card={item}
              onEditCard={() => openEdit(item)}
              onUpdated={() => void loadStatements()}
            />
          ))}
        </div>
      )}

      <CreditCardFormModal
        open={formOpen}
        card={editingCard}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void loadStatements();
        }}
      />
    </div>
  );
}
