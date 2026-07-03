import { useEffect, useState } from "react";
import type { CreditCard } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { X } from "lucide-react";

interface CreditCardFormModalProps {
  open: boolean;
  card: CreditCard | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CreditCardFormModal({
  open,
  card,
  onClose,
  onSaved,
}: CreditCardFormModalProps) {
  const [name, setName] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [dueDay, setDueDay] = useState("10");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewClosingDay, setPreviewClosingDay] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setName(card?.name ?? "");
    setLastFour(card?.lastFour ?? "");
    setDueDay(String(card?.dueDay ?? 10));
    setError(null);
    setPreviewClosingDay(card?.closingDay ?? null);
  }, [open, card]);

  useEffect(() => {
    if (!open) return;
    const parsed = Number(dueDay);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      setPreviewClosingDay(null);
      return;
    }
    let closing = parsed - 7;
    while (closing <= 0) closing += 31;
    setPreviewClosingDay(closing);
  }, [dueDay, open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      name: name.trim(),
      lastFour,
      dueDay: Number(dueDay),
    };

    try {
      const res = await apiFetch(
        card ? `/v1/credit-cards/${card.id}` : "/v1/credit-cards",
        {
          method: card ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? "Erro ao salvar cartão");
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-zinc-950/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {card ? "Editar cartão" : "Novo cartão"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400">Nome</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nubank Roxinho"
              className="h-12 w-full rounded-2xl border border-white/5 bg-white/5 px-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400">
                Últimos 4 dígitos
              </label>
              <input
                required
                maxLength={4}
                pattern="\d{4}"
                value={lastFour}
                onChange={(e) =>
                  setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="h-12 w-full rounded-2xl border border-white/5 bg-white/5 px-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400">
                Dia de vencimento
              </label>
              <input
                required
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="h-12 w-full rounded-2xl border border-white/5 bg-white/5 px-4 text-white outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {previewClosingDay !== null ? (
            <p className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-xs text-zinc-400">
              Fechamento estimado: dia{" "}
              <span className="font-bold text-emerald-400">
                {previewClosingDay}
              </span>{" "}
              (ajustado automaticamente para dias úteis e limites do mês)
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-2xl bg-white text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Salvando…" : card ? "Atualizar" : "Criar cartão"}
          </button>
        </form>
      </div>
    </div>
  );
}
