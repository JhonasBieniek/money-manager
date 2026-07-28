import { useEffect, useState } from "react";
import type { AssetClass, IncomeType, InvestmentHolding } from "@money-manager/types";
import { ASSET_CLASSES, ASSET_CLASS_LABELS } from "@money-manager/types";
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

const RV_ASSET_CLASSES = ASSET_CLASSES.filter(
  (c): c is Exclude<AssetClass, "fixed_income"> => c !== "fixed_income",
);

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

  const [incomeType, setIncomeType] = useState<IncomeType>("fixed_income");
  const [symbol, setSymbol] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("stocks");
  const [quantity, setQuantity] = useState("");
  const [averageCost, setAverageCost] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (holding) {
      setIncomeType(holding.incomeType);
      setSymbol(holding.symbol);
      setCurrentValue(formatMoneyDisplay(holding.currentUnitValueCents / 100));
      setAssetClass(holding.assetClass ?? "stocks");
      setQuantity(holding.quantity);
      setMaturityDate(holding.maturityDate ?? "");
      setNotes(holding.notes ?? "");
    } else {
      setIncomeType("fixed_income");
      setSymbol("");
      setCurrentValue("");
      setAssetClass("stocks");
      setQuantity("");
      setAverageCost("");
      setMaturityDate("");
      setNotes("");
    }
    setError(null);
  }, [open, holding]);

  if (!open) return null;

  const isRv = incomeType === "variable_income";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isEditing && !isRv) {
      const valueParsed = parseMoneyAmountInput(currentValue);
      if (!Number.isFinite(valueParsed) || valueParsed < 0) {
        setError("Informe um valor válido.");
        setLoading(false);
        return;
      }
    }
    if (!isEditing && isRv) {
      const quantityParsed = Number(quantity);
      if (!Number.isFinite(quantityParsed) || quantityParsed <= 0) {
        setError("Informe uma quantidade válida.");
        setLoading(false);
        return;
      }
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
              incomeType,
              ...(isRv
                ? {
                    assetClass,
                    quantity: Number(quantity),
                    averageCostCents: averageCost
                      ? Math.round(parseMoneyAmountInput(averageCost) * 100)
                      : null,
                  }
                : {
                    currentUnitValueCents: Math.round(
                      parseMoneyAmountInput(currentValue) * 100,
                    ),
                  }),
              maturityDate: maturityDate || null,
              notes: notes.trim() || null,
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
          {!isEditing ? (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Tipo
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIncomeType("fixed_income")}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    !isRv
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/5 bg-white/5 text-zinc-400"
                  }`}
                >
                  Renda fixa
                </button>
                <button
                  type="button"
                  onClick={() => setIncomeType("variable_income")}
                  className={`flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    isRv
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/5 bg-white/5 text-zinc-400"
                  }`}
                >
                  Renda variável
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              {isRv ? "Ticker" : "Nome"}
            </label>
            <input
              type="text"
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={isRv ? "Ex.: PETR4" : "Ex.: CDB Banco X"}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {!isEditing && !isRv ? (
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

          {!isEditing && isRv ? (
            <>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Classe do ativo
                </label>
                <select
                  value={assetClass}
                  onChange={(e) => setAssetClass(e.target.value as AssetClass)}
                  className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
                >
                  {RV_ASSET_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {ASSET_CLASS_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Quantidade
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Ex.: 100"
                  className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Preço médio (opcional)
                </label>
                <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                  <span className="text-zinc-500">R$</span>
                  <MoneyAmountInput
                    value={averageCost}
                    onChange={setAverageCost}
                    className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                A cotação inicial é buscada automaticamente após criar a posição.
              </p>
            </>
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
