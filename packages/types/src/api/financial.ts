export type PaymentMethod =
  | "credit_card"
  | "debit_card"
  | "pix"
  | "cash"
  | "bank_transfer"
  | "other";

export type ExpenseSource = "manual" | "telegram_whisper" | "telegram_manual";

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

/** Despesa do usuário (valores em centavos). */
export interface Expense {
  id: string;
  userId: string;
  goalCategory: import("./goals.js").GoalCategory;
  tagIds?: string[];
  amountCents: number;
  description: string;
  paymentMethod: PaymentMethod;
  cardLastFour: string | null;
  source: ExpenseSource;
  idempotencyKey: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExpenseListResponse {
  items: Expense[];
  meta: PaginationMeta;
}

export interface CreateExpenseResponse {
  id: string;
}
