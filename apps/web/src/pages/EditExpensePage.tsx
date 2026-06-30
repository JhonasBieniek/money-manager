import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTransactionModals } from "../components/providers/transaction-modals";

export function EditExpensePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openExpenseEditModal } = useTransactionModals();

  useEffect(() => {
    if (id) {
      openExpenseEditModal(id);
      navigate("/dashboard/expenses", { replace: true });
    }
  }, [id, navigate, openExpenseEditModal]);

  return (
    <p className="text-center text-sm text-zinc-500">Abrindo edição…</p>
  );
}
