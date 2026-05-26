import type { ExpenseSource, OcrStatus, PaymentMethod } from "./enums.js";
import type { GoalCategory } from "./goal-category.js";

export interface Expense {
  id: string;
  amountCents: number;
  goalCategory: GoalCategory;
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
  tagIds?: string[];
}
