import { useEffect, useState } from "react";
import type { PiggyBank } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { X } from "lucide-react";
import { DEFAULT_PIGGY_BANK_ICON, PIGGY_BANK_ICONS } from "./piggy-bank-icons";

interface PiggyBankFormModalProps {
  open: boolean;
  piggyBank: PiggyBank | null;
  onClose: () => void;
  onSaved: () => void;
}

function formatMoneyDisplay(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

export function PiggyBankFormModal({
  open,
  piggyBank,
  onClose,
  onSaved,
}: PiggyBankFormModalProps) {
  const isEditing = piggyBank !== null;

  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_PIGGY_BANK_ICON);
  const [hasTarget, setHasTarget] = useState(false);
  const [targetAmount, setTargetAmount] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (piggyBank) {
      setName(piggyBank.name);
      setIcon(piggyBank.icon ?? DEFAULT_PIGGY_BANK_ICON);
      setHasTarget(piggyBank.targetAmountCents !== null);
      setTargetAmount(
        piggyBank.targetAmountCents !== null
          ? formatMoneyDisplay(piggyBank.targetAmountCents / 100)
          : "",
      );
      setGoalDescription(piggyBank.goalDescription ?? "");
      setTargetDate(piggyBank.targetDate ?? "");
    } else {
      setName("");
      setIcon(DEFAULT_PIGGY_BANK_ICON);
      setHasTarget(false);
      setTargetAmount("");
      setGoalDescription("");
      setTargetDate("");
    }
    setError(null);
  }, [open, piggyBank]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const targetParsed = parseMoneyAmountInput(targetAmount);
    if (hasTarget && (!Number.isFinite(targetParsed) || targetParsed <= 0)) {
      setError("Informe um valor de meta válido.");
      setLoading(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      icon,
      goalDescription: goalDescription.trim() || null,
      targetDate: targetDate || null,
      targetAmountCents: hasTarget ? Math.round(targetParsed * 100) : null,
    };

    try {
      const res = await apiFetch(
        isEditing ? `/v1/piggy-banks/${piggyBank.id}` : "/v1/piggy-banks",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar cofrinho");
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
        aria-labelledby="piggy-bank-form-title"
        className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="piggy-bank-form-title"
            className="text-xl font-bold text-white"
          >
            {isEditing ? "Editar cofrinho" : "Novo cofrinho"}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Viagem para o Japão"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Ícone
            </label>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {PIGGY_BANK_ICONS.map(({ name: iconName, Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
                    icon === iconName
                      ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                      : "border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10",
                  )}
                  aria-label={iconName}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Descrição do objetivo (opcional)
            </label>
            <input
              type="text"
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              placeholder="Ex.: 15 dias no Japão em 2027"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={hasTarget}
              onChange={(e) => setHasTarget(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30"
            />
            <span className="text-sm text-zinc-300">
              Este cofrinho tem uma meta em dinheiro
            </span>
          </label>

          {hasTarget ? (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor da meta
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={targetAmount}
                  onChange={setTargetAmount}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Data alvo (opcional)
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:ring-1 focus:ring-emerald-500/30"
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
                : "Criar cofrinho"}
          </button>
        </form>
      </div>
    </div>
  );
}
