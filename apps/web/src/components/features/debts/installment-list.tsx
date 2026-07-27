import { Check } from "lucide-react";
import { cn } from "../../../lib/cn";

export interface InstallmentListItem {
  key: string;
  number: number;
  dueDate: string;
  amountCents: number;
  paid: boolean;
  toggling?: boolean;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDueDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

interface InstallmentListProps {
  items: InstallmentListItem[];
  onToggle: (item: InstallmentListItem) => void;
}

export function InstallmentList({ items, onToggle }: InstallmentListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
        Parcelas
      </label>
      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-white/5 bg-white/5 p-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.toggling}
            onClick={() => onToggle(item)}
            aria-pressed={item.paid}
            aria-label={`Parcela ${item.number} - ${item.paid ? "paga" : "pendente"}`}
            className={cn(
              "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
              item.paid
                ? "bg-emerald-500/10 text-emerald-300"
                : "text-zinc-400 hover:bg-white/5",
            )}
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  item.paid
                    ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                    : "border-white/20",
                )}
              >
                {item.paid ? <Check className="h-3 w-3" /> : null}
              </span>
              Parcela {item.number} · {formatDueDate(item.dueDate)}
            </span>
            <span className="font-mono">
              {formatCurrency(item.amountCents)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
