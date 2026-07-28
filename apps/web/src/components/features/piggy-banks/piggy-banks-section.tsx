import type { PiggyBank } from "@money-manager/types";
import { Plus } from "lucide-react";
import { PiggyBankCard } from "./piggy-bank-card";

interface PiggyBanksSectionProps {
  piggyBanks: PiggyBank[];
  onCreate: () => void;
  onDeposit: (piggyBank: PiggyBank) => void;
  onWithdraw: (piggyBank: PiggyBank) => void;
  onEdit: (piggyBank: PiggyBank) => void;
  onDelete: (id: string) => void;
  onMarkCompleted: (id: string) => void;
}

export function PiggyBanksSection({
  piggyBanks,
  onCreate,
  onDeposit,
  onWithdraw,
  onEdit,
  onDelete,
  onMarkCompleted,
}: PiggyBanksSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Cofrinhos</h2>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Novo cofrinho
        </button>
      </div>

      {piggyBanks.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center sm:rounded-3xl">
          <p className="text-zinc-400">Nenhum cofrinho criado ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {piggyBanks.map((piggyBank) => (
            <PiggyBankCard
              key={piggyBank.id}
              piggyBank={piggyBank}
              onDeposit={onDeposit}
              onWithdraw={onWithdraw}
              onEdit={onEdit}
              onDelete={onDelete}
              onMarkCompleted={onMarkCompleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
