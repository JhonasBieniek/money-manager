import { useEffect, useState } from "react";
import type { GoalCategory, PaymentMethod } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { ExpenseForm } from "./expense-form";

interface ExpenseApi {
  id: string;
  amountCents: number;
  description: string;
  goalCategory?: GoalCategory | null;
  occurredAt: string;
  paymentMethod?: PaymentMethod;
  cardLastFour?: string | null;
  creditCardId?: string | null;
  tagIds?: string[];
}

export function ExpenseModalForm({
  editId,
  formKey,
  onSuccess,
  onCancel,
}: {
  editId?: string;
  formKey: number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(Boolean(editId));
  const [error, setError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<ExpenseApi | null>(null);

  useEffect(() => {
    if (!editId) {
      setLoading(false);
      setError(null);
      setInitialData(null);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/v1/expenses/${editId}`);
        if (!res.ok) throw new Error("Despesa não encontrada");
        const data = (await res.json()) as ExpenseApi;
        if (!cancelled) setInitialData(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Despesa não encontrada",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [editId, formKey]);

  if (editId && loading) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">Carregando…</p>
    );
  }

  if (editId && (error || !initialData)) {
    return (
      <p className="py-8 text-center text-sm text-red-400">
        {error ?? "Despesa não encontrada"}
      </p>
    );
  }

  const formInitialData = initialData
    ? {
        id: initialData.id,
        amountCents: initialData.amountCents,
        description: initialData.description,
        goalCategory: initialData.goalCategory ?? undefined,
        occurredAt: initialData.occurredAt,
        paymentMethod: initialData.paymentMethod,
        cardLastFour: initialData.cardLastFour,
        creditCardId: initialData.creditCardId,
        tagIds: initialData.tagIds,
      }
    : undefined;

  return (
    <ExpenseForm
      key={`expense-${formKey}-${editId ?? "new"}`}
      initialData={formInitialData}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
}
