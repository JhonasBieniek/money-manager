"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTransactionModals } from "@/components/providers/transaction-modals";

export default function EditIncomeRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { openIncomeEditModal } = useTransactionModals();

  useEffect(() => {
    if (id) {
      openIncomeEditModal(id);
      router.replace("/dashboard/incomes");
    }
  }, [id, openIncomeEditModal, router]);

  return (
    <div className="px-6 py-12 text-center text-sm text-zinc-500">Abrindo edição…</div>
  );
}
