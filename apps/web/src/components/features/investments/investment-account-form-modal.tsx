import { useEffect, useState } from "react";
import type { InvestmentAccount } from "@money-manager/types";
import {
  INVESTMENT_ACCOUNT_TYPE_LABELS,
  INVESTMENT_ACCOUNT_TYPES,
} from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { X } from "lucide-react";

interface InvestmentAccountFormModalProps {
  open: boolean;
  account: InvestmentAccount | null;
  onClose: () => void;
  onSaved: () => void;
}

export function InvestmentAccountFormModal({
  open,
  account,
  onClose,
  onSaved,
}: InvestmentAccountFormModalProps) {
  const isEditing = account !== null;

  const [name, setName] = useState("");
  const [type, setType] =
    useState<(typeof INVESTMENT_ACCOUNT_TYPES)[number]>("brokerage");
  const [institution, setInstitution] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setName(account.name);
      setType(account.type);
      setInstitution(account.institution ?? "");
    } else {
      setName("");
      setType("brokerage");
      setInstitution("");
    }
    setError(null);
  }, [open, account]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      institution: institution.trim() || null,
    };

    try {
      const res = await apiFetch(
        isEditing
          ? `/v1/investment-accounts/${account.id}`
          : "/v1/investment-accounts",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar conta");
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
        aria-labelledby="investment-account-form-title"
        className="glass w-full max-w-md rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="investment-account-form-title"
            className="text-xl font-bold text-white"
          >
            {isEditing ? "Editar conta" : "Nova conta de investimento"}
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
              placeholder="Ex.: XP Investimentos"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Tipo
            </label>
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as (typeof INVESTMENT_ACCOUNT_TYPES)[number])
              }
              className="w-full rounded-2xl border border-white/5 bg-zinc-900 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            >
              {INVESTMENT_ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>
                  {INVESTMENT_ACCOUNT_TYPE_LABELS[accountType]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Instituição (opcional)
            </label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="Ex.: XP"
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
                : "Criar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}
