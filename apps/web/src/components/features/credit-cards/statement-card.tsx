import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CreditCardWithCurrentStatement } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { formatFilterPeriodLabel } from "../../../lib/transaction-list-filters";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { CheckCircle2, Lock, Pencil, RotateCcw, Unlock } from "lucide-react";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const statusLabels = {
  open: "Aberta",
  closed: "Fechada",
  paid: "Paga",
} as const;

function formatClosingLabel(periodEnd: string): string {
  const [year, month, day] = periodEnd.split("-").map(Number);
  if (!year || !month || !day) {
    return periodEnd;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(year, month - 1, day));
}

export function StatementCard({
  card,
  onEditCard,
  onUpdated,
}: {
  card: CreditCardWithCurrentStatement;
  onEditCard: () => void;
  onUpdated: () => void;
}) {
  const statement = card.currentStatement;
  const [adjustingTotal, setAdjustingTotal] = useState(false);
  const [adjustedInput, setAdjustedInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!adjustingTotal) {
      return;
    }
    const input = totalInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, [adjustingTotal]);

  if (!statement) {
    return (
      <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-white">{card.name} · {card.lastFour}</p>
          </div>
          <button
            type="button"
            onClick={onEditCard}
            className="text-xs font-bold text-zinc-400 hover:text-white"
          >
            Editar
          </button>
        </div>
        <p className="mt-4 text-sm text-zinc-500">
          Sem fatura neste período.
        </p>
      </div>
    );
  }

  const displayTotal =
    statement.adjustedTotalCents ?? statement.calculatedTotalCents;
  const periodLabel = formatFilterPeriodLabel(
    String(statement.cycleMonth),
    String(statement.cycleYear),
  );

  function startAdjustingTotal() {
    setAdjustedInput(centsToInput(displayTotal));
    setAdjustingTotal(true);
  }

  function cancelAdjustingTotal() {
    setAdjustingTotal(false);
    setAdjustedInput("");
  }

  async function patchStatement(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/v1/credit-cards/${card.id}/statements/${statement!.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? "Falha na operação");
      }
      onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function saveAdjusted() {
    const cents = Math.round(parseMoneyAmountInput(adjustedInput) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Informe um valor válido.");
      return;
    }
    await patchStatement({ adjustedTotalCents: cents });
    setAdjustingTotal(false);
    setAdjustedInput("");
  }

  async function clearAdjusted() {
    await patchStatement({ adjustedTotalCents: null });
    setAdjustingTotal(false);
    setAdjustedInput("");
  }

  function handleTotalKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveAdjusted();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelAdjustingTotal();
    }
  }

  return (
    <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-white">{card.name} · {card.lastFour}</p>
            <button
              type="button"
              onClick={onEditCard}
              className="text-zinc-500 hover:text-white"
              aria-label="Editar cartão"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-zinc-500">
            Vence dia {card.dueDay} · fecha em{" "}
            {formatClosingLabel(statement.periodEnd)} (fatura atual)
          </p>
          <p className="mt-1 text-xs text-zinc-600">Fatura {periodLabel}</p>
        </div>

        <span
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
            statement.status === "open" && "bg-emerald-500/10 text-emerald-400",
            statement.status === "closed" && "bg-amber-500/10 text-amber-400",
            statement.status === "paid" && "bg-zinc-500/10 text-zinc-400",
          )}
        >
          {statusLabels[statement.status]}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Calculado
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {formatCents(statement.calculatedTotalCents)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Total da fatura
          </p>
          {adjustingTotal ? (
            <div className="mt-1">
              <div className="flex min-w-0 items-baseline gap-1 text-2xl font-bold text-emerald-400">
                <span className="shrink-0">R$</span>
                <MoneyAmountInput
                  ref={totalInputRef}
                  value={adjustedInput}
                  onChange={setAdjustedInput}
                  onKeyDown={handleTotalKeyDown}
                  className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0 text-2xl font-bold text-emerald-400 outline-none ring-0 placeholder:text-emerald-400/40 focus:bg-transparent focus:ring-0"
                  placeholder="0,00"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveAdjusted()}
                  disabled={loading}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-zinc-950 disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={cancelAdjustingTotal}
                  disabled={loading}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-400"
                >
                  Cancelar
                </button>
                {statement.adjustedTotalCents !== null ? (
                  <button
                    type="button"
                    onClick={() => void clearAdjusted()}
                    disabled={loading}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-400"
                  >
                    Usar calculado
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              {formatCents(displayTotal)}
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {statement.status === "open" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void patchStatement({ status: "closed" })}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <Lock className="h-3.5 w-3.5" />
            Fechar fatura
          </button>
        ) : null}

        {statement.status === "closed" ? (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void patchStatement({ status: "open" })}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reabrir
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void patchStatement({ status: "paid" })}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white px-4 py-2 text-xs font-bold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Marcar como paga
            </button>
          </>
        ) : null}

        {statement.status !== "paid" && !adjustingTotal ? (
          <button
            type="button"
            disabled={loading}
            onClick={startAdjustingTotal}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <Unlock className="h-3.5 w-3.5" />
            Ajustar total
          </button>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        Período: {statement.periodStart} → {statement.periodEnd} · Vencimento{" "}
        {statement.dueDate}
      </p>
    </div>
  );
}
