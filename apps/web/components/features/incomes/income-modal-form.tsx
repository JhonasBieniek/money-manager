"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { IncomeForm } from "./income-form";

interface IncomeApi {
  id: string;
  amountCents: number;
  description: string;
  source: string;
  occurredAt: string;
  tagIds?: string[];
}

export function IncomeModalForm({
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
  const [initialData, setInitialData] = useState<IncomeApi | null>(null);

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
        const res = await apiFetch(`/v1/incomes/${editId}`);
        if (!res.ok) throw new Error("Receita não encontrada");
        const data = (await res.json()) as IncomeApi;
        if (!cancelled) setInitialData(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Receita não encontrada");
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
    return <p className="py-8 text-center text-sm text-zinc-500">Carregando…</p>;
  }

  if (editId && (error || !initialData)) {
    return <p className="py-8 text-center text-sm text-red-400">{error ?? "Receita não encontrada"}</p>;
  }

  return (
    <IncomeForm
      key={`income-${formKey}-${editId ?? "new"}`}
      initialData={initialData ?? undefined}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
}
