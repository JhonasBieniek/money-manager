import type { InvestmentHolding } from "@money-manager/types";
import { Edit3, Lock, RefreshCw, Trash2, TrendingUp, Unlock } from "lucide-react";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

const PENDING_QUOTE_MESSAGE = "Cotação pendente";
const STALE_ERROR_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function positionValueCents(holding: InvestmentHolding): number {
  return Math.round(Number(holding.quantity) * holding.currentUnitValueCents);
}

function unrealizedPnlCents(holding: InvestmentHolding): number | null {
  if (holding.averageCostCents === null) return null;
  return Math.round(
    (holding.currentUnitValueCents - holding.averageCostCents) *
      Number(holding.quantity),
  );
}

function isQuoteErrorVisible(holding: InvestmentHolding): boolean {
  if (holding.lastQuoteError === null) return false;
  if (holding.lastQuoteError === PENDING_QUOTE_MESSAGE) return true;
  const age = Date.now() - new Date(holding.lastValuationAt).getTime();
  return age > STALE_ERROR_THRESHOLD_MS;
}

interface HoldingRowProps {
  holding: InvestmentHolding;
  onEdit: (holding: InvestmentHolding) => void;
  onValuation: (holding: InvestmentHolding) => void;
  onDelete: (id: string) => void;
  onRefreshQuote: (id: string) => void;
  onToggleOverride: (id: string, manualOverride: boolean) => void;
}

export function HoldingRow({
  holding,
  onEdit,
  onValuation,
  onDelete,
  onRefreshQuote,
  onToggleOverride,
}: HoldingRowProps) {
  const isRv = holding.incomeType === "variable_income";
  const showQuoteError = isRv && isQuoteErrorVisible(holding);
  const pnlCents = isRv ? unrealizedPnlCents(holding) : null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{holding.symbol}</p>
        <p className="text-sm text-zinc-500">
          {formatCurrency(positionValueCents(holding))}
          {isRv ? ` · ${holding.quantity} × ${formatCurrency(holding.currentUnitValueCents)}` : ""}
          {holding.maturityDate
            ? ` · vence em ${formatDate(holding.maturityDate)}`
            : ""}
        </p>
        {pnlCents !== null ? (
          <p
            className={`text-xs ${pnlCents >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {pnlCents >= 0 ? "+" : ""}
            {formatCurrency(pnlCents)} não realizado
          </p>
        ) : null}
        {showQuoteError ? (
          <p className="mt-1 text-xs text-amber-400">
            {holding.lastQuoteError === PENDING_QUOTE_MESSAGE
              ? PENDING_QUOTE_MESSAGE
              : `Cotação desatualizada: ${holding.lastQuoteError}`}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isRv && holding.pricingSource !== "manual" ? (
          <>
            <button
              type="button"
              onClick={() => onRefreshQuote(holding.id)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-emerald-400"
              aria-label="Atualizar cotação"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleOverride(holding.id, !holding.manualOverride)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label={
                holding.manualOverride
                  ? "Voltar à cotação automática"
                  : "Fixar valor manualmente"
              }
            >
              {holding.manualOverride ? (
                <Unlock className="h-4 w-4" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
            </button>
          </>
        ) : null}
        {!isRv || holding.manualOverride || holding.pricingSource === "manual" ? (
          <button
            type="button"
            onClick={() => onValuation(holding)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-emerald-400"
            aria-label="Atualizar valor"
          >
            <TrendingUp className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onEdit(holding)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Editar posição"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(holding.id)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
          aria-label="Excluir posição"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
