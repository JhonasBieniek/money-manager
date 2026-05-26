import { pgEnum } from "drizzle-orm/pg-core";

export const paymentMethodValues = [
  "credit_card",
  "debit_card",
  "pix",
  "cash",
  "bank_transfer",
  "other",
] as const;

export const expenseSourceValues = [
  "manual",
  "telegram_ocr",
  "telegram_manual",
  "telegram_voice",
] as const;

export const ocrStatusValues = ["pending", "confirmed", "rejected"] as const;

export const paymentMethodEnum = pgEnum("payment_method", paymentMethodValues);
export const expenseSourceEnum = pgEnum("expense_source", expenseSourceValues);
export const ocrStatusEnum = pgEnum("ocr_status", ocrStatusValues);

