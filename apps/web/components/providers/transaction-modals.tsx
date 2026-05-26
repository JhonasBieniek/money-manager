"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ExpenseModalForm } from "@/components/features/expenses/expense-modal-form";
import { IncomeModalForm } from "@/components/features/incomes/income-modal-form";
import { Modal } from "@/components/ui/modal";

type ActiveModal = "expense" | "income" | null;

type TransactionModalsContextValue = {
  openExpenseModal: () => void;
  openExpenseEditModal: (id: string) => void;
  openIncomeModal: () => void;
  openIncomeEditModal: (id: string) => void;
  refreshToken: number;
};

const TransactionModalsContext =
  createContext<TransactionModalsContextValue | null>(null);

export function useTransactionModals() {
  const ctx = useContext(TransactionModalsContext);
  if (!ctx) {
    throw new Error("useTransactionModals must be used within TransactionModalsProvider");
  }
  return ctx;
}

export function TransactionModalsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveModal>(null);
  const [expenseEditId, setExpenseEditId] = useState<string | null>(null);
  const [incomeEditId, setIncomeEditId] = useState<string | null>(null);
  const [expenseFormKey, setExpenseFormKey] = useState(0);
  const [incomeFormKey, setIncomeFormKey] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const close = useCallback(() => {
    setActive(null);
    setExpenseEditId(null);
    setIncomeEditId(null);
  }, []);

  const openExpenseModal = useCallback(() => {
    setExpenseEditId(null);
    setExpenseFormKey((k) => k + 1);
    setActive("expense");
  }, []);

  const openExpenseEditModal = useCallback((id: string) => {
    setExpenseEditId(id);
    setExpenseFormKey((k) => k + 1);
    setActive("expense");
  }, []);

  const openIncomeModal = useCallback(() => {
    setIncomeEditId(null);
    setIncomeFormKey((k) => k + 1);
    setActive("income");
  }, []);

  const openIncomeEditModal = useCallback((id: string) => {
    setIncomeEditId(id);
    setIncomeFormKey((k) => k + 1);
    setActive("income");
  }, []);

  const handleSuccess = useCallback(() => {
    setActive(null);
    setExpenseEditId(null);
    setIncomeEditId(null);
    setRefreshToken((t) => t + 1);
    router.refresh();
  }, [router]);

  const isExpenseEdit = expenseEditId != null;
  const isIncomeEdit = incomeEditId != null;

  const value = useMemo(
    () => ({
      openExpenseModal,
      openExpenseEditModal,
      openIncomeModal,
      openIncomeEditModal,
      refreshToken,
    }),
    [
      openExpenseModal,
      openExpenseEditModal,
      openIncomeModal,
      openIncomeEditModal,
      refreshToken,
    ]
  );

  return (
    <TransactionModalsContext.Provider value={value}>
      {children}

      <Modal
        open={active === "expense"}
        onClose={close}
        title={isExpenseEdit ? "Editar despesa" : "Nova despesa"}
        description={
          isExpenseEdit
            ? "Altere os detalhes abaixo para atualizar o registro."
            : "Registre os detalhes do gasto para manter seu controle atualizado."
        }
      >
        <ExpenseModalForm
          editId={expenseEditId ?? undefined}
          formKey={expenseFormKey}
          onSuccess={handleSuccess}
          onCancel={close}
        />
      </Modal>

      <Modal
        open={active === "income"}
        onClose={close}
        title={isIncomeEdit ? "Editar receita" : "Nova receita"}
        description={
          isIncomeEdit
            ? "Atualize os dados da receita."
            : "Adicione uma nova entrada de dinheiro ao seu controle."
        }
      >
        <IncomeModalForm
          editId={incomeEditId ?? undefined}
          formKey={incomeFormKey}
          onSuccess={handleSuccess}
          onCancel={close}
        />
      </Modal>
    </TransactionModalsContext.Provider>
  );
}
