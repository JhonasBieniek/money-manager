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

