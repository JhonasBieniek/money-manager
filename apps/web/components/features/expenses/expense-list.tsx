"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { GOAL_CATEGORY_LABELS, type GoalCategory } from "@money-manager/types";
import {
  formatOccurredAtPtBr,
  localDayRangeFromDateInput,
} from "@money-manager/utils";
import { useTransactionModals } from "@/components/providers/transaction-modals";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  Calendar as CalendarIcon, 
  X, 
  Trash2, 
  Edit3,
  Filter
} from "lucide-react";

interface Expense {
  id: string;
  amountCents: number;
  description: string;
  goalCategory?: GoalCategory;
  tagIds?: string[];
  occurredAt: string;
  paymentMethod: string;
}

export function ExpenseList() {
  const { refreshToken, openExpenseEditModal } = useTransactionModals();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (startDate) {
          const { start } = localDayRangeFromDateInput(startDate);
          params.append("startDate", start.toISOString());
        }
        if (endDate) {
          const { end } = localDayRangeFromDateInput(endDate);
          params.append("endDate", end.toISOString());
        }
        if (search) params.append("description", search);
        
        const query = params.toString() ? `?${params.toString()}` : "";
        
        const res = await apiFetch(`/v1/expenses${query}`);
        if (!res.ok) throw new Error("Falha ao carregar despesas");
        const data = await res.json();
        setExpenses(data.items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Falha ao carregar despesas");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [startDate, endDate, search, refreshToken]);

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  }

  function formatDate(dateStr: string) {
    return formatOccurredAtPtBr(dateStr);
  }

  async function handleDelete(expenseId: string) {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;

    const res = await apiFetch(`/v1/expenses/${expenseId}`, { method: "DELETE" });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      setError(
        typeof errData.message === "string"
          ? errData.message
          : "Falha ao excluir despesa"
      );
      return;
    }

    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
  }

  return (
    <div className="space-y-8">
      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 transition-colors group-focus-within:text-white" />
          <input
            type="text"
            placeholder="Buscar por descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-14 rounded-2xl bg-white/5 border border-white/5 pl-12 pr-4 text-sm text-white placeholder:text-zinc-600 outline-none transition-all focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
        
        <div className="flex items-center gap-3">
            <div className="flex h-14 items-center gap-3 rounded-2xl bg-white/5 border border-white/5 px-4 overflow-hidden">
                <CalendarIcon className="h-4 w-4 text-zinc-500" />
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-sm text-zinc-300 outline-none [color-scheme:dark]"
                />
                <span className="text-zinc-700">|</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-sm text-zinc-300 outline-none [color-scheme:dark]"
                />
            </div>

            {(startDate || endDate || search) && (
            <button
                onClick={() => { setStartDate(""); setEndDate(""); setSearch(""); }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 border border-red-500/10 hover:bg-red-500/20 transition-all active:scale-95"
            >
                <X className="h-5 w-5" />
            </button>
            )}
        </div>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400"
        >
          Erro: {error}
        </motion.div>
      )}

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-[1.5rem] bg-white/5" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-white/5 py-32 text-center"
        >
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
            <Filter className="h-8 w-8 text-zinc-700" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Sem resultados</h3>
          <p className="text-sm text-zinc-500 max-w-[30ch]">
            Não encontramos nenhuma despesa para os filtros aplicados no momento.
          </p>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence mode="popLayout">
            {expenses.map((expense, i) => (
              <motion.div
                key={expense.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="group glass relative flex items-center gap-6 p-6 rounded-[1.5rem] transition-all hover:bg-white/5 hover:border-white/10"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400 group-hover:bg-emerald-500/10 group-hover:text-emerald-400 transition-colors">
                  <span className="text-[10px] font-bold uppercase tracking-tighter">
                    {formatDate(expense.occurredAt).split(" ")[1]}
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {formatDate(expense.occurredAt).split(" ")[0]}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white truncate text-lg">
                    {expense.description}
                  </h4>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                    {expense.goalCategory ? (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300/90">
                        {GOAL_CATEGORY_LABELS[expense.goalCategory]}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {expense.tagIds && expense.tagIds.length > 0
                        ? `${expense.tagIds.length} tag${expense.tagIds.length === 1 ? "" : "s"}`
                        : "Sem tags"}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline">{expense.paymentMethod || "Dinheiro"}</span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xl font-bold text-white font-mono">
                    {formatCurrency(expense.amountCents)}
                  </p>
                  <p className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest mt-1">
                    Pago
                  </p>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                  <button
                    type="button"
                    onClick={() => openExpenseEditModal(expense.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(expense.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
