import { useEffect, useMemo, useState } from "react";
import type {
  DebtInstallment,
  DebtWithInstallments,
  PaymentMethod,
} from "@money-manager/types";
import {
  INSTALLMENT_PERIOD_LABELS,
  INSTALLMENT_PERIODS,
  type InstallmentPeriod,
} from "@money-manager/types";
import {
  calculateDebtEndDate,
  calendarDate,
  generateInstallmentDueDates,
  parseDateString,
  toDateString,
} from "@money-manager/utils/installment-schedule";
import { apiFetch } from "../../../lib/api";
import { cn } from "../../../lib/cn";
import {
  MoneyAmountInput,
  parseMoneyAmountInput,
} from "../../ui/money-amount-input";
import { SearchableSelect } from "../../ui/searchable-select";
import { InstallmentList, type InstallmentListItem } from "./installment-list";
import { Banknote, CreditCard, X, Zap } from "lucide-react";

interface DebtFormModalProps {
  open: boolean;
  debt: DebtWithInstallments | null;
  onClose: () => void;
  onSaved: () => void;
  onInstallmentToggled?: () => void;
}

interface CreditCardOption {
  id: string;
  name: string;
  lastFour: string;
}

const paymentMethods = [
  { id: 0, label: "Dinheiro", icon: Banknote },
  { id: 1, label: "Cartão", icon: CreditCard },
  { id: 2, label: "PIX", icon: Zap },
];

function formatMoneyDisplay(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function paymentMethodLabel(index: number): string {
  return paymentMethods.find((method) => method.id === index)?.label ?? "Dinheiro";
}

function paymentMethodToIndex(method: PaymentMethod): number {
  if (method === "credit_card") return 1;
  if (method === "pix") return 2;
  return 0;
}

export function DebtFormModal({
  open,
  debt,
  onClose,
  onSaved,
  onInstallmentToggled,
}: DebtFormModalProps) {
  const isEditing = debt !== null;

  const [name, setName] = useState("");
  const [installmentCount, setInstallmentCount] = useState("12");
  const [installmentPeriod, setInstallmentPeriod] =
    useState<InstallmentPeriod>("monthly");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [autoSyncExpenses, setAutoSyncExpenses] = useState(false);
  const [paymentMethodIndex, setPaymentMethodIndex] = useState(0);
  const [creditCardId, setCreditCardId] = useState("");
  const [creditCards, setCreditCards] = useState<CreditCardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [installments, setInstallments] = useState<DebtInstallment[]>([]);
  const [previewPaidNumbers, setPreviewPaidNumbers] = useState<Set<number>>(
    new Set(),
  );
  const [togglingInstallmentId, setTogglingInstallmentId] = useState<
    string | null
  >(null);

  const creditCardOptions = useMemo(
    () =>
      creditCards.map((card) => ({
        value: card.id,
        label: `${card.name} · ${card.lastFour}`,
      })),
    [creditCards],
  );

  useEffect(() => {
    if (!open) return;

    if (debt) {
      setName(debt.name);
      setInstallmentCount(String(debt.installmentCount));
      setInstallmentPeriod(debt.installmentPeriod);
      setInstallmentAmount(formatMoneyDisplay(debt.installmentCents / 100));
      setTotalAmount(formatMoneyDisplay(debt.totalCents / 100));
      setAutoSyncExpenses(debt.autoSyncExpenses);
      setPaymentMethodIndex(paymentMethodToIndex(debt.paymentMethod));
      setCreditCardId(debt.creditCardId ?? "");
      setStartDate(debt.startDate);
      setInstallments(debt.installments);
    } else {
      setName("");
      setInstallmentCount("12");
      setInstallmentPeriod("monthly");
      setInstallmentAmount("");
      setTotalAmount("");
      setAutoSyncExpenses(false);
      setPaymentMethodIndex(0);
      setCreditCardId("");
      setStartDate(
        toDateString(
          calendarDate(
            new Date().getFullYear(),
            new Date().getMonth() + 1,
            new Date().getDate(),
          ),
        ),
      );
      setInstallments([]);
    }
    setPreviewPaidNumbers(new Set());
    setError(null);
  }, [open, debt]);

  useEffect(() => {
    if (!open) return;

    async function loadCards() {
      try {
        const res = await apiFetch("/v1/credit-cards");
        if (res.ok) {
          const data = (await res.json()) as { items: CreditCardOption[] };
          setCreditCards(data.items ?? []);
        }
      } catch {
        // ignore
      }
    }

    void loadCards();
  }, [open]);

  const countValue = Number.parseInt(installmentCount, 10);

  const endDateLabel = useMemo(() => {
    if (!Number.isInteger(countValue) || countValue < 1) {
      return null;
    }
    const start = startDate
      ? parseDateString(startDate)
      : calendarDate(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          new Date().getDate(),
        );
    const end = calculateDebtEndDate(start, countValue, installmentPeriod);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(end);
  }, [countValue, installmentPeriod, startDate]);

  const previewInstallmentCents = useMemo(() => {
    const installmentParsed = parseMoneyAmountInput(installmentAmount);
    if (Number.isFinite(installmentParsed) && installmentParsed > 0) {
      return Math.round(installmentParsed * 100);
    }
    const totalParsed = parseMoneyAmountInput(totalAmount);
    if (
      Number.isFinite(totalParsed) &&
      totalParsed > 0 &&
      Number.isInteger(countValue) &&
      countValue >= 1
    ) {
      return Math.round((totalParsed * 100) / countValue);
    }
    return 0;
  }, [installmentAmount, totalAmount, countValue]);

  const previewDueDates = useMemo(() => {
    if (!Number.isInteger(countValue) || countValue < 1) {
      return [];
    }
    const start = startDate
      ? parseDateString(startDate)
      : calendarDate(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          new Date().getDate(),
        );
    return generateInstallmentDueDates(start, countValue, installmentPeriod);
  }, [countValue, installmentPeriod, startDate]);

  const installmentListItems: InstallmentListItem[] = isEditing
    ? installments.map((item) => ({
        key: item.id,
        number: item.installmentNumber,
        dueDate: item.dueDate,
        amountCents: item.amountCents,
        paid: item.status === "paid",
        toggling: togglingInstallmentId === item.id,
      }))
    : previewDueDates.map((date, index) => ({
        key: `preview-${index + 1}`,
        number: index + 1,
        dueDate: toDateString(date),
        amountCents: previewInstallmentCents,
        paid: previewPaidNumbers.has(index + 1),
      }));

  async function handleToggleInstallment(item: InstallmentListItem) {
    if (!isEditing) {
      setPreviewPaidNumbers((prev) => {
        const next = new Set(prev);
        if (next.has(item.number)) {
          next.delete(item.number);
        } else {
          next.add(item.number);
        }
        return next;
      });
      return;
    }

    if (!debt) return;
    setTogglingInstallmentId(item.key);
    try {
      const res = await apiFetch(
        `/v1/debts/${debt.id}/installments/${item.key}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: item.paid ? "pending" : "paid" }),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao atualizar parcela");
      }
      const updated = (await res.json()) as DebtWithInstallments;
      setInstallments(updated.installments);
      onInstallmentToggled?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar parcela");
    } finally {
      setTogglingInstallmentId(null);
    }
  }

  function syncTotalFromInstallment(nextInstallment: string, count: number) {
    const parsed = parseMoneyAmountInput(nextInstallment);
    if (!Number.isFinite(parsed) || parsed <= 0 || count < 1) {
      return;
    }
    setTotalAmount(formatMoneyDisplay(parsed * count));
  }

  function syncInstallmentFromTotal(nextTotal: string, count: number) {
    const parsed = parseMoneyAmountInput(nextTotal);
    if (!Number.isFinite(parsed) || parsed <= 0 || count < 1) {
      return;
    }
    setInstallmentAmount(formatMoneyDisplay(parsed / count));
  }

  function handleInstallmentAmountChange(value: string) {
    setInstallmentAmount(value);
    if (Number.isInteger(countValue) && countValue >= 1) {
      syncTotalFromInstallment(value, countValue);
    }
  }

  function handleTotalAmountChange(value: string) {
    setTotalAmount(value);
    if (Number.isInteger(countValue) && countValue >= 1) {
      syncInstallmentFromTotal(value, countValue);
    }
  }

  function handleInstallmentCountChange(value: string) {
    setInstallmentCount(value);
    const count = Number.parseInt(value, 10);
    if (!Number.isInteger(count) || count < 1) {
      return;
    }
    const installmentParsed = parseMoneyAmountInput(installmentAmount);
    const totalParsed = parseMoneyAmountInput(totalAmount);
    if (Number.isFinite(installmentParsed) && installmentParsed > 0) {
      syncTotalFromInstallment(installmentAmount, count);
    } else if (Number.isFinite(totalParsed) && totalParsed > 0) {
      syncInstallmentFromTotal(totalAmount, count);
    }
  }

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const installmentParsed = parseMoneyAmountInput(installmentAmount);
    const totalParsed = parseMoneyAmountInput(totalAmount);

    if (!Number.isInteger(countValue) || countValue < 1) {
      setError("Informe um número válido de parcelas.");
      setLoading(false);
      return;
    }

    if (
      (!Number.isFinite(installmentParsed) || installmentParsed <= 0) &&
      (!Number.isFinite(totalParsed) || totalParsed <= 0)
    ) {
      setError("Informe o valor da parcela ou o valor total.");
      setLoading(false);
      return;
    }

    if (paymentMethodIndex === 1 && !creditCardId) {
      setError("Selecione um cartão de crédito.");
      setLoading(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      autoSyncExpenses,
      paymentMethodIndex,
    };

    payload.installmentCount = countValue;
    payload.installmentPeriod = installmentPeriod;
    payload.startDate = startDate;

    if (Number.isFinite(installmentParsed) && installmentParsed > 0) {
      payload.installmentAmount = installmentParsed;
    }
    if (Number.isFinite(totalParsed) && totalParsed > 0) {
      payload.totalAmount = totalParsed;
    }

    if (paymentMethodIndex === 1) {
      payload.creditCardId = creditCardId;
    } else if (isEditing) {
      payload.creditCardId = null;
    }

    try {
      const res = await apiFetch(
        isEditing ? `/v1/debts/${debt.id}` : "/v1/debts",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao salvar dívida");
      }

      if (!isEditing && previewPaidNumbers.size > 0) {
        const created = (await res.json()) as DebtWithInstallments;
        try {
          for (const installment of created.installments) {
            if (previewPaidNumbers.has(installment.installmentNumber)) {
              const patchRes = await apiFetch(
                `/v1/debts/${created.id}/installments/${installment.id}`,
                {
                  method: "PATCH",
                  body: JSON.stringify({ status: "paid" }),
                },
              );
              if (!patchRes.ok) {
                throw new Error();
              }
            }
          }
        } catch {
          // The debt itself was created successfully — a failure here only
          // affects the paid-marking follow-up, so it must not block
          // onSaved() below (that would leave the modal open in "create"
          // mode and risk a duplicate submission).
          window.alert(
            "Dívida criada, mas houve um erro ao marcar parcelas como pagas. Edite a dívida para ajustar.",
          );
        }
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="debt-form-title"
        className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 id="debt-form-title" className="text-xl font-bold text-white">
            {isEditing ? "Editar dívida" : "Nova dívida"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Nome / descrição
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Financiamento do carro"
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Parcelas
              </label>
              <input
                type="number"
                min={1}
                max={9999}
                required
                value={installmentCount}
                onChange={(e) => handleInstallmentCountChange(e.target.value)}
                className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Período
              </label>
              <select
                value={installmentPeriod}
                onChange={(e) =>
                  setInstallmentPeriod(e.target.value as InstallmentPeriod)
                }
                className="w-full rounded-2xl border border-white/5 bg-zinc-900 px-4 py-3 text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
              >
                {INSTALLMENT_PERIODS.map((period) => (
                  <option key={period} value={period}>
                    {INSTALLMENT_PERIOD_LABELS[period]}
                  </option>
                ))}
              </select>
              {endDateLabel ? (
                <p className="mt-1.5 text-xs text-zinc-500">
                  Quitação prevista: {endDateLabel}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Data de início
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor da parcela
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={installmentAmount}
                  onChange={handleInstallmentAmountChange}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Valor total
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
                <span className="text-zinc-500">R$</span>
                <MoneyAmountInput
                  value={totalAmount}
                  onChange={handleTotalAmountChange}
                  className="!rounded-none !border-0 !bg-transparent !px-0 !py-0 !text-base !font-semibold"
                />
              </div>
            </div>
          </div>

          <InstallmentList
            items={installmentListItems}
            onToggle={(item) => void handleToggleInstallment(item)}
          />

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
              Forma de pagamento
            </label>
            <div className="flex gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                const isSelected = paymentMethodIndex === method.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethodIndex(method.id)}
                    className={cn(
                      "flex h-12 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border transition-all duration-300",
                      isSelected
                        ? "border-emerald-500 bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20"
                        : "border-white/5 bg-white/5 text-zinc-500 hover:bg-white/10",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {method.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {paymentMethodIndex === 1 ? (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">
                Cartão de crédito
              </label>
              <SearchableSelect
                options={creditCardOptions}
                value={creditCardId}
                onChange={setCreditCardId}
                placeholder="Selecione um cartão…"
                required
              />
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={autoSyncExpenses}
              onChange={(e) => setAutoSyncExpenses(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30"
            />
            <span className="text-sm text-zinc-300">
              Lançar parcelas automaticamente nas despesas de cada mês (categoria
              Custos Fixos, {paymentMethodLabel(paymentMethodIndex)})
            </span>
          </label>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading
              ? "Salvando…"
              : isEditing
                ? "Salvar alterações"
                : "Criar dívida"}
          </button>
        </form>
      </div>
    </div>
  );
}
