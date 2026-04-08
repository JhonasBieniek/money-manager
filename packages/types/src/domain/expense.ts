import type { ExpenseSource, OcrStatus, PaymentMethod } from "./enums.js";

export interface Expense {
  id: string;
  userId: string;
  categoryId: string | null;
  amountCents: number;
  description: string;
  establishment: string | null;
  paymentMethod: PaymentMethod;
  cardLastFour: string | null;
  source: ExpenseSource;
  ocrStatus: OcrStatus | null;
  idempotencyKey: string | null;
  ocrRaw: unknown;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
