import type { InvestmentHolding } from "@money-manager/types";
import { Edit3, Trash2, TrendingUp } from "lucide-react";

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

interface HoldingRowProps {
  holding: InvestmentHolding;
  onEdit: (holding: InvestmentHolding) => void;
  onValuation: (holding: InvestmentHolding) => void;
  onDelete: (id: string) => void;
}

export function HoldingRow({
  holding,
  onEdit,
  onValuation,
  onDelete,
}: HoldingRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{holding.symbol}</p>
        <p className="text-sm text-zinc-500">
          {formatCurrency(holding.currentUnitValueCents)}
          {holding.maturityDate
            ? ` · vence em ${formatDate(holding.maturityDate)}`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onValuation(holding)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-zinc-400 transition hover:bg-white/10 hover:text-emerald-400"
          aria-label="Atualizar valor"
        >
          <TrendingUp className="h-4 w-4" />
        </button>
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
