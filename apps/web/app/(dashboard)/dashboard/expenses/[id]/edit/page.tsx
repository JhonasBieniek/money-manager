"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTransactionModals } from "@/components/providers/transaction-modals";

export default function EditExpenseRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { openExpenseEditModal } = useTransactionModals();

  useEffect(() => {
    if (id) {
      openExpenseEditModal(id);
      router.replace("/dashboard/expenses");
    }
  }, [id, openExpenseEditModal, router]);

  return (
    <div className="px-6 py-12 text-center text-sm text-zinc-500">Abrindo edição…</div>
  );
}
