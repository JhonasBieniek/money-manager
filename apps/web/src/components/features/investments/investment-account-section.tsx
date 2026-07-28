import type { InvestmentAccount, InvestmentHolding } from "@money-manager/types";
import { INVESTMENT_ACCOUNT_TYPE_LABELS } from "@money-manager/types";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { HoldingRow } from "./holding-row";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function positionValueCents(holding: InvestmentHolding): number {
  return Math.round(Number(holding.quantity) * holding.currentUnitValueCents);
}

interface InvestmentAccountSectionProps {
  account: InvestmentAccount;
  holdings: InvestmentHolding[];
  onEditAccount: (account: InvestmentAccount) => void;
  onDeleteAccount: (id: string) => void;
  onAddHolding: (accountId: string) => void;
  onEditHolding: (holding: InvestmentHolding) => void;
  onValuationHolding: (holding: InvestmentHolding) => void;
  onDeleteHolding: (id: string) => void;
  onRefreshHoldingQuote: (id: string) => void;
  onToggleHoldingOverride: (id: string, manualOverride: boolean) => void;
}

export function InvestmentAccountSection({
  account,
  holdings,
  onEditAccount,
  onDeleteAccount,
  onAddHolding,
  onEditHolding,
  onValuationHolding,
  onDeleteHolding,
  onRefreshHoldingQuote,
  onToggleHoldingOverride,
}: InvestmentAccountSectionProps) {
  const total = holdings.reduce((acc, h) => acc + positionValueCents(h), 0);

  return (
    <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{account.name}</h3>
          <p className="text-sm text-zinc-500">
            {INVESTMENT_ACCOUNT_TYPE_LABELS[account.type]}
            {account.institution ? ` · ${account.institution}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEditAccount(account)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Editar conta"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteAccount(account.id)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
            aria-label="Excluir conta"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-4 font-mono text-xl font-bold text-white">
        {formatCurrency(total)}
      </p>

      <div className="mt-4 space-y-2">
        {holdings.map((holding) => (
          <HoldingRow
            key={holding.id}
            holding={holding}
            onEdit={onEditHolding}
            onValuation={onValuationHolding}
            onDelete={onDeleteHolding}
            onRefreshQuote={onRefreshHoldingQuote}
            onToggleOverride={onToggleHoldingOverride}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAddHolding(account.id)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 py-3 text-sm font-semibold text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-400"
      >
        <Plus className="h-4 w-4" />
        Nova posição
      </button>
    </div>
  );
}
