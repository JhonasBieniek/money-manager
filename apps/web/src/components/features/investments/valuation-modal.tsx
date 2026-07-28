import { useEffect, useState } from "react";
import type { InvestmentHolding } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";

interface ValuationModalProps {
  open: boolean;
  holding: InvestmentHolding | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatMoneyDisplay(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function ValuationModal({
  open,
  holding,
  onClose,
  onSaved,
}: ValuationModalProps) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !holding) return;
    setValue(formatMoneyDisplay(holding.currentUnitValueCents / 100));
    setError(null);
  }, [open, holding]);

  if (!open || !holding) return null;

  const currentHolding = holding;
  const isRv = holding.incomeType === "variable_income";
  const parsedForDisplay = parseMoneyAmountInput(value);
  const unitCentsForDisplay = Number.isFinite(parsedForDisplay)
    ? Math.round(parsedForDisplay * 100)
    : 0;
  const totalCentsForDisplay = Math.round(
    Number(holding.quantity) * unitCentsForDisplay,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const parsed = parseMoneyAmountInput(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Informe um valor válido.");
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(
        `/v1/investment-holdings/${currentHolding.id}/valuation`,
        {
          method: "PATCH",
          body: JSON.stringify({
            currentUnitValueCents: Math.round(parsed * 100),
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao atualizar valor");
      }
      onSaved();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erro ao atualizar valor",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="valuation-form-title"
        className="glass w-full max-w-sm rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="valuation-form-title"
            className="text-xl font-bold text-white"
          >
            {isRv ? "Valor unitário" : "Atualizar valor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {isRv ? `${holding.symbol} · valor por unidade` : holding.symbol}
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
              <span className="text-zinc-500">R$</span>
              <MoneyAmountInput
                value={value}
                onChange={setValue}
                className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
              />
            </div>
            {isRv ? (
              <p className="mt-2 text-xs text-zinc-500">
                {holding.quantity} × {formatCurrency(unitCentsForDisplay)} ={" "}
                {formatCurrency(totalCentsForDisplay)}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Salvando…" : "Salvar valor"}
          </button>
        </form>
      </div>
    </div>
  );
}
