import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTransactionModals } from "../components/providers/transaction-modals";

export function NewIncomePage() {
  const navigate = useNavigate();
  const { openIncomeModal } = useTransactionModals();

  useEffect(() => {
    openIncomeModal();
    navigate("/dashboard/incomes", { replace: true });
  }, [navigate, openIncomeModal]);

  return (
    <p className="text-center text-sm text-zinc-500">Abrindo formulário…</p>
  );
}
