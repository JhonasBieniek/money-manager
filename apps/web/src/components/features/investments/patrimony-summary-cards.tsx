import type { PatrimonySummary } from "@money-manager/types";
import { AlertCircle } from "lucide-react";

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

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

interface PatrimonySummaryCardsProps {
  summary: PatrimonySummary;
}

export function PatrimonySummaryCards({ summary }: PatrimonySummaryCardsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Patrimônio total
          </p>
          <p className="font-mono text-2xl font-bold text-white">
            {formatCurrency(summary.totalAssetsCents)}
          </p>
        </div>
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Investimentos
          </p>
          <p className="font-mono text-xl font-bold text-white">
            {formatCurrency(summary.investmentsCents)}
          </p>
        </div>
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Cofrinhos
          </p>
          <p className="font-mono text-xl font-bold text-white">
            {formatCurrency(summary.piggyBanksCents)}
          </p>
        </div>
      </div>

      {summary.lastUpdatedAt ? (
        <p className="text-xs text-zinc-500">
          Última atualização: {formatDateTime(summary.lastUpdatedAt)}
        </p>
      ) : null}

      {summary.upcomingMaturities.length > 0 ? (
        <div className="glass rounded-2xl p-5 sm:rounded-3xl sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-bold text-white">
              Vencimentos próximos
            </p>
          </div>
          <div className="space-y-2">
            {summary.upcomingMaturities.map((item) => (
              <div
                key={item.holdingId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-zinc-300">{item.name}</span>
                <span className="text-zinc-500">
                  {formatDate(item.maturityDate)} ·{" "}
                  {formatCurrency(item.totalCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
