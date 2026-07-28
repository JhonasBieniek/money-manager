import { useCallback, useEffect, useState } from "react";
import type {
  InvestmentAccount,
  InvestmentHolding,
  PatrimonySummary,
  PiggyBank,
} from "@money-manager/types";
import { HoldingFormModal } from "../components/features/investments/holding-form-modal";
import { InvestmentAccountFormModal } from "../components/features/investments/investment-account-form-modal";
import { InvestmentAccountSection } from "../components/features/investments/investment-account-section";
import { PatrimonySummaryCards } from "../components/features/investments/patrimony-summary-cards";
import { ValuationModal } from "../components/features/investments/valuation-modal";
import { PiggyBankFormModal } from "../components/features/piggy-banks/piggy-bank-form-modal";
import { PiggyBankTransactionModal } from "../components/features/piggy-banks/piggy-bank-transaction-modal";
import { PiggyBanksSection } from "../components/features/piggy-banks/piggy-banks-section";
import { apiFetch } from "../lib/api";
import { Plus, Wallet } from "lucide-react";

export function InvestmentsPage() {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([]);
  const [piggyBanks, setPiggyBanks] = useState<PiggyBank[]>([]);
  const [summary, setSummary] = useState<PatrimonySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] =
    useState<InvestmentAccount | null>(null);

  const [holdingFormOpen, setHoldingFormOpen] = useState(false);
  const [holdingAccountId, setHoldingAccountId] = useState<string | null>(
    null,
  );
  const [editingHolding, setEditingHolding] =
    useState<InvestmentHolding | null>(null);

  const [valuationHolding, setValuationHolding] =
    useState<InvestmentHolding | null>(null);

  const [piggyBankFormOpen, setPiggyBankFormOpen] = useState(false);
  const [editingPiggyBank, setEditingPiggyBank] = useState<PiggyBank | null>(
    null,
  );

  const [transactionPiggyBank, setTransactionPiggyBank] =
    useState<PiggyBank | null>(null);
  const [transactionMode, setTransactionMode] = useState<
    "deposit" | "withdraw"
  >("deposit");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsRes, holdingsRes, piggyBanksRes, summaryRes] =
        await Promise.all([
          apiFetch("/v1/investment-accounts"),
          apiFetch("/v1/investment-holdings"),
          apiFetch("/v1/piggy-banks"),
          apiFetch("/v1/patrimony/summary"),
        ]);
      if (
        !accountsRes.ok ||
        !holdingsRes.ok ||
        !piggyBanksRes.ok ||
        !summaryRes.ok
      ) {
        throw new Error("Falha ao carregar dados de patrimônio");
      }
      const accountsData = (await accountsRes.json()) as {
        items: InvestmentAccount[];
      };
      const holdingsData = (await holdingsRes.json()) as {
        items: InvestmentHolding[];
      };
      const piggyBanksData = (await piggyBanksRes.json()) as {
        items: PiggyBank[];
      };
      const summaryData = (await summaryRes.json()) as PatrimonySummary;

      setAccounts(accountsData.items ?? []);
      setHoldings(holdingsData.items ?? []);
      setPiggyBanks(piggyBanksData.items ?? []);
      setSummary(summaryData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function openCreateAccount() {
    setEditingAccount(null);
    setAccountFormOpen(true);
  }

  function openEditAccount(account: InvestmentAccount) {
    setEditingAccount(account);
    setAccountFormOpen(true);
  }

  async function handleDeleteAccount(id: string) {
    if (
      !confirm("Tem certeza? As posições dessa conta também serão removidas.")
    )
      return;
    try {
      const res = await apiFetch(`/v1/investment-accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir conta");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function openCreateHolding(accountId: string) {
    setHoldingAccountId(accountId);
    setEditingHolding(null);
    setHoldingFormOpen(true);
  }

  function openEditHolding(holding: InvestmentHolding) {
    setHoldingAccountId(holding.accountId);
    setEditingHolding(holding);
    setHoldingFormOpen(true);
  }

  async function handleDeleteHolding(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta posição?")) return;
    try {
      const res = await apiFetch(`/v1/investment-holdings/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir posição");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  async function handleRefreshHoldingQuote(id: string) {
    try {
      const res = await apiFetch(`/v1/investment-holdings/${id}/refresh-quote`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erro ao atualizar cotação");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao atualizar cotação");
    }
  }

  async function handleToggleHoldingOverride(id: string, manualOverride: boolean) {
    try {
      const res = await apiFetch(`/v1/investment-holdings/${id}/quote-mode`, {
        method: "PATCH",
        body: JSON.stringify({ manualOverride }),
      });
      if (!res.ok) throw new Error("Erro ao alternar modo de cotação");
      void loadAll();
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Erro ao alternar modo de cotação",
      );
    }
  }

  function openCreatePiggyBank() {
    setEditingPiggyBank(null);
    setPiggyBankFormOpen(true);
  }

  function openEditPiggyBank(piggyBank: PiggyBank) {
    setEditingPiggyBank(piggyBank);
    setPiggyBankFormOpen(true);
  }

  async function handleDeletePiggyBank(id: string) {
    if (!confirm("Tem certeza que deseja excluir este cofrinho?")) return;
    try {
      const res = await apiFetch(`/v1/piggy-banks/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir cofrinho");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  function openDeposit(piggyBank: PiggyBank) {
    setTransactionPiggyBank(piggyBank);
    setTransactionMode("deposit");
  }

  function openWithdraw(piggyBank: PiggyBank) {
    setTransactionPiggyBank(piggyBank);
    setTransactionMode("withdraw");
  }

  async function handleMarkCompleted(id: string) {
    try {
      const res = await apiFetch(`/v1/piggy-banks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("Erro ao concluir cofrinho");
      void loadAll();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao concluir cofrinho");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Patrimônio
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Investimentos
          </h1>
          <p className="max-w-[50ch] text-zinc-400">
            Acompanhe suas contas de investimento, posições de renda fixa e
            cofrinhos com objetivos específicos.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateAccount}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Nova conta
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          Carregando…
        </p>
      ) : (
        <>
          {summary ? <PatrimonySummaryCards summary={summary} /> : null}

          {accounts.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center sm:rounded-3xl">
              <p className="text-zinc-400">
                Nenhuma conta de investimento cadastrada ainda.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-6">
              {accounts.map((account) => (
                <InvestmentAccountSection
                  key={account.id}
                  account={account}
                  holdings={holdings.filter(
                    (h) => h.accountId === account.id,
                  )}
                  onEditAccount={openEditAccount}
                  onDeleteAccount={(id) => void handleDeleteAccount(id)}
                  onAddHolding={openCreateHolding}
                  onEditHolding={openEditHolding}
                  onValuationHolding={setValuationHolding}
                  onDeleteHolding={(id) => void handleDeleteHolding(id)}
                  onRefreshHoldingQuote={(id) => void handleRefreshHoldingQuote(id)}
                  onToggleHoldingOverride={(id, v) =>
                    void handleToggleHoldingOverride(id, v)
                  }
                />
              ))}
            </div>
          )}

          <PiggyBanksSection
            piggyBanks={piggyBanks}
            onCreate={openCreatePiggyBank}
            onDeposit={openDeposit}
            onWithdraw={openWithdraw}
            onEdit={openEditPiggyBank}
            onDelete={(id) => void handleDeletePiggyBank(id)}
            onMarkCompleted={(id) => void handleMarkCompleted(id)}
          />
        </>
      )}

      <InvestmentAccountFormModal
        open={accountFormOpen}
        account={editingAccount}
        onClose={() => setAccountFormOpen(false)}
        onSaved={() => {
          setAccountFormOpen(false);
          void loadAll();
        }}
      />

      <HoldingFormModal
        open={holdingFormOpen}
        accountId={holdingAccountId}
        holding={editingHolding}
        onClose={() => setHoldingFormOpen(false)}
        onSaved={() => {
          setHoldingFormOpen(false);
          void loadAll();
        }}
      />

      <ValuationModal
        open={valuationHolding !== null}
        holding={valuationHolding}
        onClose={() => setValuationHolding(null)}
        onSaved={() => {
          setValuationHolding(null);
          void loadAll();
        }}
      />

      <PiggyBankFormModal
        open={piggyBankFormOpen}
        piggyBank={editingPiggyBank}
        onClose={() => setPiggyBankFormOpen(false)}
        onSaved={() => {
          setPiggyBankFormOpen(false);
          void loadAll();
        }}
      />

      <PiggyBankTransactionModal
        open={transactionPiggyBank !== null}
        piggyBank={transactionPiggyBank}
        mode={transactionMode}
        onClose={() => setTransactionPiggyBank(null)}
        onSaved={() => {
          setTransactionPiggyBank(null);
          void loadAll();
        }}
      />
    </div>
  );
}
