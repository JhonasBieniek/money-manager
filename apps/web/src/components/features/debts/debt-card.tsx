import type { DebtWithInstallments } from "@money-manager/types";
import { INSTALLMENT_PERIOD_LABELS } from "@money-manager/types";
import { cn } from "../../../lib/cn";
import { Edit3, Trash2 } from "lucide-react";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

interface DebtCardProps {
  debt: DebtWithInstallments;
  onEdit: (debt: DebtWithInstallments) => void;
  onDelete: (id: string) => void;
}

export function DebtCard({ debt, onEdit, onDelete }: DebtCardProps) {
  const progress =
    debt.totalCents > 0
      ? Math.min(100, Math.round((debt.paidCents / debt.totalCents) * 100))
      : 0;
  const paidInstallments = debt.installments.filter(
    (item) => item.status === "paid",
  ).length;

  return (
    <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{debt.name}</h3>
          <p className="text-sm text-zinc-500">
            {debt.installmentCount}× {formatCurrency(debt.installmentCents)} ·{" "}
            {INSTALLMENT_PERIOD_LABELS[debt.installmentPeriod]}
          </p>
          {debt.autoSyncExpenses ? (
            <p className="mt-1 text-xs text-emerald-400/80">
              Despesas automáticas ativas
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
              debt.status === "paid_off"
                ? "bg-zinc-500/10 text-zinc-400"
                : "bg-emerald-500/10 text-emerald-400",
            )}
          >
            {debt.status === "paid_off" ? "Quitada" : "Ativa"}
          </span>
          <button
            type="button"
            onClick={() => onEdit(debt)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Editar dívida"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(debt.id)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
            aria-label="Excluir dívida"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-end justify-between text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Restante
            </p>
            <p className="text-2xl font-bold text-white">
              {formatCurrency(debt.remainingBalanceCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Total
            </p>
            <p className="font-mono text-zinc-400">
              {formatCurrency(debt.totalCents)}
            </p>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="text-xs text-zinc-500">
          {paidInstallments}/{debt.installmentCount} parcelas pagas ·{" "}
          {formatCurrency(debt.paidCents)} abatidos
        </p>
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        Início {debt.startDate} → fim {debt.endDate}
      </p>
    </div>
  );
}
