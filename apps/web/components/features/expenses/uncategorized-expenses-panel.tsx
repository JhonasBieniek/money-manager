"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABELS,
  type GoalCategory,
} from "@money-manager/types";
import { formatOccurredAtPtBr } from "@money-manager/utils";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-select";

interface UncategorizedExpense {
  id: string;
  amountCents: number;
  description: string;
  occurredAt: string;
  source: string;
  tagIds?: string[];
}

interface ExpenseTag {
  id: string;
  name: string;
}

const goalCategoryOptions = GOAL_CATEGORIES.map((value) => ({
  value,
  label: GOAL_CATEGORY_LABELS[value],
}));

function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function UncategorizedExpensesPanel() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<UncategorizedExpense[]>([]);
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [goalCategory, setGoalCategory] = useState<GoalCategory>("prazeres");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const tagOptions = useMemo(
    () => tags.map((t) => ({ value: t.id, label: t.name })),
    [tags]
  );

  const refreshCount = useCallback(async () => {
    const res = await apiFetch("/v1/expenses/uncategorized/count");
    if (res.ok) {
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expRes, tagsRes] = await Promise.all([
        apiFetch("/v1/expenses/uncategorized?limit=50"),
        apiFetch("/v1/tags"),
      ]);
      if (expRes.ok) {
        const data = (await expRes.json()) as { items: UncategorizedExpense[] };
        setItems(data.items ?? []);
      }
      if (tagsRes.ok) {
        const data = (await tagsRes.json()) as { items: ExpenseTag[] };
        setTags(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const interval = setInterval(() => {
      void refreshCount();
    }, 60_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  useEffect(() => {
    if (open) {
      void loadItems();
    }
  }, [open, loadItems]);

  async function handleCategorize(expenseId: string) {
    setError(null);
    const res = await apiFetch(`/v1/expenses/${expenseId}/categorize`, {
      method: "PATCH",
      body: JSON.stringify({
        goalCategory,
        tagIds: selectedTags.length > 0 ? selectedTags : undefined,
      }),
    });
    if (!res.ok) {
      setError("Não foi possível categorizar a despesa.");
      return;
    }
    setActiveId(null);
    setSelectedTags([]);
    setItems((prev) => prev.filter((e) => e.id !== expenseId));
    await refreshCount();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
        title="Pendente de categoria"
        aria-label="Pendente de categoria"
      >
        <Bell className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[min(100vw-2rem,24rem)] rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Pendente de categoria</p>
              <p className="text-xs text-zinc-500">{count} despesa(s)</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error ? (
            <p className="mb-3 text-xs text-red-400">{error}</p>
          ) : null}

          {loading ? (
            <p className="text-sm text-zinc-500">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma despesa pendente.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {items.map((expense) => (
                <li
                  key={expense.id}
                  className="rounded-xl border border-white/5 bg-white/5 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-white">{expense.description}</p>
                      <p className="text-xs text-zinc-500">
                        {formatBrl(expense.amountCents)} ·{" "}
                        {formatOccurredAtPtBr(expense.occurredAt)}
                      </p>
                    </div>
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                      Sem categoria
                    </span>
                  </div>

                  {activeId === expense.id ? (
                    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                      <p className="text-xs font-medium text-zinc-400">Categoria</p>
                      <SearchableSelect
                        options={goalCategoryOptions}
                        value={goalCategory}
                        onChange={(v) => setGoalCategory(v as GoalCategory)}
                      />
                      <p className="text-xs font-medium text-zinc-400">Tags</p>
                      <SearchableMultiSelect
                        options={tagOptions}
                        value={selectedTags}
                        onChange={setSelectedTags}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCategorize(expense.id)}
                          className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-zinc-950"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveId(null)}
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(expense.id);
                        setSelectedTags(expense.tagIds ?? []);
                      }}
                      className="mt-2 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                    >
                      Atribuir categoria
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
