import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTransactionModals } from "../components/providers/transaction-modals";

export function NewExpensePage() {
  const navigate = useNavigate();
  const { openExpenseModal } = useTransactionModals();

  useEffect(() => {
    openExpenseModal();
    navigate("/dashboard/expenses", { replace: true });
  }, [navigate, openExpenseModal]);

  return (
    <p className="text-center text-sm text-zinc-500">Abrindo formulário…</p>
  );
}
