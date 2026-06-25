import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { IncomeSource } from "@money-manager/types";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import { SearchableMultiSelect } from "../../ui/searchable-select";
import {
  ArrowRight,
  Briefcase,
  Calendar as CalendarIcon,
  Check,
  Gift,
  Hash,
  MessageSquare,
  MoreHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface IncomeFormProps {
  initialData?: {
    id: string;
    amountCents: number;
    description: string;
    source?: string;
    tagIds?: string[];
    occurredAt: string;
  };
  onSuccess?: () => void;
}

const sourceOptions = [
  { id: "salary" as IncomeSource, label: "Salário", icon: Briefcase },
  { id: "freelance" as IncomeSource, label: "Freelance", icon: TrendingUp },
  { id: "investment" as IncomeSource, label: "Investimento", icon: Wallet },
  { id: "gift" as IncomeSource, label: "Presente", icon: Gift },
  { id: "other" as IncomeSource, label: "Outros", icon: MoreHorizontal },
];

export function IncomeForm({ initialData, onSuccess }: IncomeFormProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(
    initialData?.amountCents ? (initialData.amountCents / 100).toString() : "",
  );
  const [description, setDescription] = useState(
    initialData?.description || "",
  );
  const [source, setSource] = useState<IncomeSource>(
    (initialData?.source as IncomeSource) || "other",
  );
  const [occurredAt, setOccurredAt] = useState(
    initialData?.occurredAt
      ? new Date(initialData.occurredAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialData?.tagIds ?? [],
  );

  const tagOptions = useMemo(
    () => tags.map((t) => ({ value: t.id, label: t.name })),
    [tags],
  );

  useEffect(() => {
    async function loadTags() {
      try {
        const res = await apiFetch("/v1/tags");
        if (res.ok) {
          const data = (await res.json()) as {
            items: Array<{ id: string; name: string }>;
          };
          setTags(data.items ?? []);
        }
      } catch {
        // ignore
      }
    }
    void loadTags();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      amount: parseFloat(amount),
      description,
      source,
      occurredAt: new Date(occurredAt).toISOString(),
      tagIds: selectedTags.length > 0 ? selectedTags : undefined,
    };

    try {
      const method = initialData ? "PATCH" : "POST";
      const path = initialData
        ? `/v1/incomes/${initialData.id}`
        : "/v1/incomes";

      const res = await apiFetch(path, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = (await res.json()) as { message?: string };
        throw new Error(errData.message || "Erro ao salvar receita");
      }

      if (onSuccess) onSuccess();
      else navigate("/dashboard/incomes");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar receita");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-10">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-10">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            <ArrowRight className="h-3 w-3 text-emerald-400" />
            Valor da Receita
          </label>
          <div className="relative">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-4xl font-bold text-zinc-600">
              R$
            </span>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-[2rem] border border-white/5 bg-white/5 px-20 py-10 text-6xl font-black text-white outline-none transition-all placeholder:text-zinc-800 focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center gap-2 px-1 text-xs font-bold text-zinc-400">
              <MessageSquare className="h-4 w-4" />
              Descrição
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Salário mensal"
              className="h-14 w-full rounded-2xl border border-white/5 bg-white/5 px-5 text-zinc-100 outline-none transition-all focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 px-1 text-xs font-bold text-zinc-400">
              <CalendarIcon className="h-4 w-4" />
              Data da Receita
            </label>
            <input
              type="date"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="h-14 w-full rounded-2xl border border-white/5 bg-white/5 px-5 text-zinc-100 outline-none transition-all [color-scheme:dark] focus:bg-white/10 focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          <div className="space-y-3 md:col-span-2">
            <label className="flex items-center gap-2 px-1 text-xs font-bold text-zinc-400">
              <Hash className="h-4 w-4" />
              Tags (opcional)
            </label>
            <SearchableMultiSelect
              options={tagOptions}
              value={selectedTags}
              onChange={setSelectedTags}
              placeholder="Buscar tags…"
            />
          </div>

          <div className="space-y-3 md:col-span-2">
            <label className="flex items-center gap-2 px-1 text-xs font-bold text-zinc-400">
              <Wallet className="h-4 w-4" />
              Fonte
            </label>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {sourceOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = source === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSource(opt.id)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 transition-all duration-300",
                      isSelected
                        ? "scale-105 border-emerald-500 bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20"
                        : "border-white/5 bg-white/5 text-zinc-500 hover:bg-white/10",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm font-bold text-zinc-500 transition-colors hover:text-white"
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={loading}
          className="group relative flex h-16 items-center gap-4 rounded-3xl bg-white px-10 text-lg font-black text-zinc-950 transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />
              Processando...
            </span>
          ) : (
            <>
              {initialData ? "Atualizar" : "Salvar Receita"}
              <Check className="h-6 w-6 transition-transform group-hover:scale-125" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
