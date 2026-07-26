export const INSTALLMENT_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "yearly",
] as const;

export type InstallmentPeriod = (typeof INSTALLMENT_PERIODS)[number];

import type { PaymentMethod } from "./financial.js";

export type DebtStatus = "active" | "paid_off";

export type DebtInstallmentStatus = "pending" | "paid";

export const INSTALLMENT_PERIOD_LABELS: Record<InstallmentPeriod, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
};

export interface Debt {
  id: string;
  userId: string;
  name: string;
  installmentCount: number;
  installmentPeriod: InstallmentPeriod;
  installmentCents: number;
  totalCents: number;
  autoSyncExpenses: boolean;
  paymentMethod: PaymentMethod;
  creditCardId: string | null;
  startDate: string;
  endDate: string;
  remainingBalanceCents: number;
  paidCents: number;
  status: DebtStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DebtInstallment {
  id: string;
  debtId: string;
  installmentNumber: number;
  dueDate: string;
  amountCents: number;
  status: DebtInstallmentStatus;
  paidAt: string | null;
  expenseId: string | null;
}

export interface DebtWithInstallments extends Debt {
  installments: DebtInstallment[];
}
