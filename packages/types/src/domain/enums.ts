export type PaymentMethod =
  | "credit_card"
  | "debit_card"
  | "pix"
  | "cash"
  | "bank_transfer"
  | "other";

export type ExpenseSource =
  | "manual"
  | "telegram_ocr"
  | "telegram_manual"
  | "telegram_voice";

export type OcrStatus = "pending" | "confirmed" | "rejected";
