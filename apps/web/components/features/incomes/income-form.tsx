"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  dateInputToIso,
  isoToDateInput,
} from "@money-manager/utils";
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
import { SearchableMultiSelect } from "@/components/ui/searchable-select";
import {
  Briefcase,
  Gift,
  MoreHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react";

interface Tag {
  id: string;
  name: string;
}

interface IncomeFormProps {
  initialData?: {
    id: string;
    amountCents: number;
    description: string;
    source?: string;
    occurredAt: string;
    tagIds?: string[];
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

const sourceOptions = [
  { id: "salary", label: "Salário", icon: Briefcase },
  { id: "freelance", label: "Freelance", icon: TrendingUp },
  { id: "investment", label: "Investimento", icon: Wallet },
  { id: "gift", label: "Presente", icon: Gift },
  { id: "other", label: "Outros", icon: MoreHorizontal },
] as const;

export function IncomeForm({ initialData, onSuccess, onCancel }: IncomeFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialData?.tagIds ?? []
  );
  const [amount, setAmount] = useState(
    initialData?.amountCents ? (initialData.amountCents / 100).toString() : ""
  );
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [source, setSource] = useState(initialData?.source ?? "other");
  const [occurredAt, setOccurredAt] = useState(
    initialData?.occurredAt
      ? isoToDateInput(initialData.occurredAt)
      : isoToDateInput(new Date().toISOString())
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
      source,
      occurredAt: dateInputToIso(occurredAt),
      tagIds: selectedTags.length > 0 ? selectedTags : undefined,
    };

    try {
      const method = initialData ? "PATCH" : "POST";
      const path = initialData ? `/v1/incomes/${initialData.id}` : "/v1/incomes";

      const res = await apiFetch(path, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? "Erro ao salvar receita");
      }

      if (onSuccess) onSuccess();
      else router.push("/dashboard/incomes");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar receita");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <FormAlert>{error}</FormAlert> : null}

      <AmountField value={amount} onChange={setAmount} label="Valor da receita" />

      <FormSection title="Detalhes" description="Informações básicas do lançamento.">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Descrição" htmlFor="income-description" className="sm:col-span-2">
            <FormInput
              id="income-description"
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Salário, freelance…"
            />
          </FormField>

          <FormField label="Data" htmlFor="income-date">
            <FormInput
              id="income-date"
              type="date"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="[color-scheme:dark]"
            />
          </FormField>

          <div className="sm:col-span-2">
            <ChoiceGroup label="Origem" columns={5}>
              {sourceOptions.map((opt) => (
                <ChoiceOption
                  key={opt.id}
                  label={opt.label}
                  icon={opt.icon}
                  selected={source === opt.id}
                  onSelect={() => setSource(opt.id)}
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
        submitLabel={initialData ? "Salvar alterações" : "Registrar receita"}
        loading={loading}
      />
    </form>
  );
}
