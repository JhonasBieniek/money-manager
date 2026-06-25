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
  "telegram_whisper",
  "telegram_manual",
]);
