"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  dateInputToIso,
  isoToDateInput,
} from "@money-manager/utils";
import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABELS,
  type GoalCategory,
} from "@money-manager/types";
import {
  AmountField,
  ChoiceGroup,
  ChoiceOption,
  FormActions,
  FormAlert,
  FormField,
  FormInput,
  FormSection,
} from "@/components/ui/transaction-form";
import {
  SearchableMultiSelect,
  SearchableSelect,
} from "@/components/ui/searchable-select";
import { Banknote, CreditCard, Zap } from "lucide-react";

interface ExpenseTag {
  id: string;
  name: string;
}

interface ExpenseFormProps {
  initialData?: {
    id: string;
    amountCents: number;
    description: string;
    goalCategory?: GoalCategory;
    occurredAt: string;
    paymentMethodIndex?: number;
    tagIds?: string[];
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

const paymentMethods = [
  { id: 0, label: "Dinheiro", icon: Banknote },
  { id: 1, label: "Cartão", icon: CreditCard },
  { id: 2, label: "PIX", icon: Zap },
] as const;

const goalCategoryOptions = GOAL_CATEGORIES.map((value) => ({
  value,
  label: GOAL_CATEGORY_LABELS[value],
}));

export function ExpenseForm({ initialData, onSuccess, onCancel }: ExpenseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<ExpenseTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialData?.tagIds ?? []
  );
  const [amount, setAmount] = useState(
    initialData?.amountCents ? (initialData.amountCents / 100).toString() : ""
  );
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [goalCategory, setGoalCategory] = useState<GoalCategory>(
    initialData?.goalCategory ?? "custos-fixos"
  );
  const [occurredAt, setOccurredAt] = useState(
    initialData?.occurredAt
      ? isoToDateInput(initialData.occurredAt)
      : isoToDateInput(new Date().toISOString())
  );
  const [paymentMethodIndex, setPaymentMethodIndex] = useState(
    initialData?.paymentMethodIndex ?? 0
  );
  const [error, setError] = useState<string | null>(null);

  const tagOptions = useMemo(
    () => tags.map((t) => ({ value: t.id, label: t.name })),
    [tags]
  );

  useEffect(() => {
    async function loadTags() {
      try {
        const res = await apiFetch("/v1/tags");
        if (res.ok) {
          const data = await res.json();
          setTags(data.items ?? []);
        }
      } catch {
        /* ignore */
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
      goalCategory,
      occurredAt: dateInputToIso(occurredAt),
      paymentMethodIndex: Number(paymentMethodIndex),
      tagIds: selectedTags.length > 0 ? selectedTags : undefined,
    };

    try {
      const method = initialData ? "PATCH" : "POST";
      const path = initialData ? `/v1/expenses/${initialData.id}` : "/v1/expenses";

      const res = await apiFetch(path, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? "Erro ao salvar despesa");
      }

      if (onSuccess) onSuccess();
      else router.push("/dashboard/expenses");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar despesa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <FormAlert>{error}</FormAlert> : null}

      <AmountField value={amount} onChange={setAmount} label="Valor da despesa" />

      <FormSection
        title="Categoria da meta"
        description="Toda despesa deve ser enquadrada em uma das categorias do seu plano financeiro."
      >
        <FormField label="Categoria" htmlFor="goal-category">
          <SearchableSelect
            options={goalCategoryOptions}
            value={goalCategory}
            onChange={(v) => setGoalCategory(v as GoalCategory)}
            placeholder="Buscar categoria…"
            required
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Detalhes"
        description="Informações básicas do lançamento."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Descrição" htmlFor="description" className="sm:col-span-2">
            <FormInput
              id="description"
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Supermercado, aluguel…"
            />
          </FormField>

          <FormField label="Data" htmlFor="occurredAt">
            <FormInput
              id="occurredAt"
              type="date"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="[color-scheme:dark]"
            />
          </FormField>

          <div className="sm:col-span-2">
            <ChoiceGroup label="Forma de pagamento" columns={3}>
              {paymentMethods.map((m) => (
                <ChoiceOption
                  key={m.id}
                  label={m.label}
                  icon={m.icon}
                  selected={paymentMethodIndex === m.id}
                  onSelect={() => setPaymentMethodIndex(m.id)}
                />
              ))}
            </ChoiceGroup>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Tags"
        description="Opcional. Digite para filtrar e selecionar uma ou mais tags."
      >
        <SearchableMultiSelect
          options={tagOptions}
          value={selectedTags}
          onChange={setSelectedTags}
          placeholder="Buscar tags…"
        />
      </FormSection>

      <FormActions
        onCancel={onCancel ?? (() => router.back())}
        submitLabel={initialData ? "Salvar alterações" : "Registrar despesa"}
        loading={loading}
      />
    </form>
  );
}
