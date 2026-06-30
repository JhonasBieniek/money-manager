import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTransactionModals } from "../components/providers/transaction-modals";

export function EditIncomePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openIncomeEditModal } = useTransactionModals();

  useEffect(() => {
    if (id) {
      openIncomeEditModal(id);
      navigate("/dashboard/incomes", { replace: true });
    }
  }, [id, navigate, openIncomeEditModal]);

  return (
    <p className="text-center text-sm text-zinc-500">Abrindo edição…</p>
  );
}
