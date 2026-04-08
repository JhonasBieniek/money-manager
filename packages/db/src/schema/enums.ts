import { pgEnum } from "drizzle-orm/pg-core";

export const paymentMethodEnum = pgEnum("payment_method", [
  "credit_card",
  "debit_card",
  "pix",
  "cash",
  "bank_transfer",
  "other",
]);

export const expenseSourceEnum = pgEnum("expense_source", [
  "manual",
  "telegram_ocr",
  "telegram_manual",
]);

export const ocrStatusEnum = pgEnum("ocr_status", [
  "pending",
  "confirmed",
  "rejected",
]);
