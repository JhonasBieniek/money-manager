import { useEffect, useState } from "react";
import type { PiggyBank } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";

interface PiggyBankTransactionModalProps {
  open: boolean;
  piggyBank: PiggyBank | null;
  mode: "deposit" | "withdraw";
  onClose: () => void;
  onSaved: () => void;
}

export function PiggyBankTransactionModal({
  open,
  piggyBank,
  mode,
  onClose,
  onSaved,
}: PiggyBankTransactionModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setNote("");
    setError(null);
  }, [open, piggyBank, mode]);

  if (!open || !piggyBank) return null;

  const currentPiggyBank = piggyBank;
  const isDeposit = mode === "deposit";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const parsed = parseMoneyAmountInput(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Informe um valor maior que zero.");
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(
        `/v1/piggy-banks/${currentPiggyBank.id}/${isDeposit ? "deposit" : "withdraw"}`,
        {
          method: "POST",
          body: JSON.stringify({
            amountCents: Math.round(parsed * 100),
            note: note.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao registrar transação");
      }
      onSaved();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erro ao registrar transação",
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
        aria-labelledby="piggy-bank-transaction-title"
        className="glass w-full max-w-sm rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="piggy-bank-transaction-title"
            className="text-xl font-bold text-white"
          >
            {isDeposit ? "Depositar em" : "Sacar de"} {piggyBank.name}
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
              Valor
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
              <span className="text-zinc-500">R$</span>
              <MoneyAmountInput
                value={amount}
                onChange={setAmount}
                className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Salvando…" : isDeposit ? "Depositar" : "Sacar"}
          </button>
        </form>
      </div>
    </div>
  );
}
