import { useEffect, useState } from "react";
import type { InvestmentHolding } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";

interface HoldingFormModalProps {
  open: boolean;
  accountId: string | null;
  holding: InvestmentHolding | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatMoneyDisplay(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function HoldingFormModal({
  open,
  accountId,
  holding,
  onClose,
  onSaved,
}: HoldingFormModalProps) {
  const isEditing = holding !== null;

  const [symbol, setSymbol] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (holding) {
      setSymbol(holding.symbol);
      setCurrentValue(formatMoneyDisplay(holding.currentUnitValueCents / 100));
      setMaturityDate(holding.maturityDate ?? "");
      setNotes(holding.notes ?? "");
    } else {
      setSymbol("");
      setCurrentValue("");
      setMaturityDate("");
      setNotes("");
    }
    setError(null);
  }, [open, holding]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const valueParsed = parseMoneyAmountInput(currentValue);
    if (!isEditing && (!Number.isFinite(valueParsed) || valueParsed < 0)) {
      setError("Informe um valor válido.");
      setLoading(false);
      return;
    }

    try {
      const res = isEditing
        ? await apiFetch(`/v1/investment-holdings/${holding.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              symbol: symbol.trim(),
              maturityDate: maturityDate || null,
              notes: notes.trim() || null,
            }),
          })
        : await apiFetch("/v1/investment-holdings", {
            method: "POST",
            body: JSON.stringify({
              accountId,
              symbol: symbol.trim(),
              currentUnitValueCents: Math.round(valueParsed * 100),
              maturityDate: maturityDate || undefined,
              notes: notes.trim() || undefined,
            }),
          });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar posição");
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="holding-form-title"
        className="glass w-full max-w-md rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="holding-form-title" className="text-xl font-bold text-white">
            {isEditing ? "Editar posição" : "Nova posição"}
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
              Nome
            </label>
            <input
              type="text"
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="Ex.: CDB Banco X"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {!isEditing ? (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor atual
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={currentValue}
                  onChange={setCurrentValue}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Vencimento (opcional)
            </label>
            <input
              type="date"
              value={maturityDate}
              onChange={(e) => setMaturityDate(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações"
                : "Criar posição"}
          </button>
        </form>
      </div>
    </div>
  );
}
