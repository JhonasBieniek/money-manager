import type { PiggyBank } from "@money-manager/types";
import { ArrowDownCircle, ArrowUpCircle, Edit3, Trash2 } from "lucide-react";
import { DEFAULT_PIGGY_BANK_ICON, PIGGY_BANK_ICON_MAP } from "./piggy-bank-icons";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function daysSince(iso: string) {
  const created = new Date(iso);
  const now = new Date();
  return Math.floor(
    (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
  );
}

interface PiggyBankCardProps {
  piggyBank: PiggyBank;
  onDeposit: (piggyBank: PiggyBank) => void;
  onWithdraw: (piggyBank: PiggyBank) => void;
  onEdit: (piggyBank: PiggyBank) => void;
  onDelete: (id: string) => void;
  onMarkCompleted: (id: string) => void;
}

export function PiggyBankCard({
  piggyBank,
  onDeposit,
  onWithdraw,
  onEdit,
  onDelete,
  onMarkCompleted,
}: PiggyBankCardProps) {
  const Icon =
    PIGGY_BANK_ICON_MAP[piggyBank.icon ?? DEFAULT_PIGGY_BANK_ICON] ??
    PIGGY_BANK_ICON_MAP[DEFAULT_PIGGY_BANK_ICON]!;

  const hasTarget = piggyBank.targetAmountCents !== null;
  const progress = hasTarget
    ? Math.min(
        100,
        Math.round(
          (piggyBank.currentAmountCents / piggyBank.targetAmountCents!) * 100,
        ),
      )
    : 0;
  const reachedTarget =
    hasTarget && piggyBank.currentAmountCents >= piggyBank.targetAmountCents!;
  const showCompletionPrompt = reachedTarget && piggyBank.status === "active";

  return (
    <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-white">{piggyBank.name}</h3>
            {piggyBank.goalDescription ? (
              <p className="text-xs text-zinc-500">
                {piggyBank.goalDescription}
              </p>
            ) : null}
          </div>
        </div>
        {piggyBank.status === "completed" ? (
          <span className="inline-flex w-fit rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-400">
            Concluído
          </span>
        ) : null}
      </div>

      <p className="mt-4 font-mono text-2xl font-bold text-white">
        {formatCurrency(piggyBank.currentAmountCents)}
      </p>

      {hasTarget ? (
        <div className="mt-3 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">
            {progress}% de {formatCurrency(piggyBank.targetAmountCents!)}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">
          {daysSince(piggyBank.createdAt)} dias acumulando
        </p>
      )}

      {showCompletionPrompt ? (
        <button
          type="button"
          onClick={() => onMarkCompleted(piggyBank.id)}
          className="mt-4 w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-bold text-emerald-400 transition hover:bg-emerald-500/20"
        >
          Meta atingida — marcar como concluído?
        </button>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDeposit(piggyBank)}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/5 text-sm font-semibold text-emerald-400 transition hover:bg-white/10"
        >
          <ArrowUpCircle className="h-4 w-4" />
          Depositar
        </button>
        <button
          type="button"
          onClick={() => onWithdraw(piggyBank)}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
        >
          <ArrowDownCircle className="h-4 w-4" />
          Sacar
        </button>
        <button
          type="button"
          onClick={() => onEdit(piggyBank)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Editar cofrinho"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(piggyBank.id)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
          aria-label="Excluir cofrinho"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
