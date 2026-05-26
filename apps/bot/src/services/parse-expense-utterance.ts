export type ExpenseUtteranceParse = {
  rawText: string;
  amount?: number;
  description?: string;
  paymentMethod?: "cash" | "credit_card" | "pix";
};

const AMOUNT_PATTERNS = [
  /r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i,
  /(\d+(?:[.,]\d{1,2})?)\s*reais?/i,
];

const PAYMENT_PATTERNS: Array<{ pattern: RegExp; method: ExpenseUtteranceParse["paymentMethod"] }> = [
  { pattern: /\bpix\b/i, method: "pix" },
  { pattern: /\bcart[aã]o(?:\s+de\s+cr[eé]dito)?\b/i, method: "credit_card" },
  { pattern: /\bdinheiro\b|\bem\s+esp[eé]cie\b/i, method: "cash" },
];

const DESCRIPTION_PATTERN =
  /\b(?:no|na|nos|nas|em|de|da|do|para|pro|pra)\s+([a-zà-ú0-9][\wà-ú\s-]{1,40})/i;

function parseAmount(text: string): number | undefined {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const normalized = match[1].replace(/\./g, "").replace(",", ".");
    const value = Number.parseFloat(normalized);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

function parsePaymentMethod(text: string): ExpenseUtteranceParse["paymentMethod"] | undefined {
  for (const { pattern, method } of PAYMENT_PATTERNS) {
    if (pattern.test(text)) {
      return method;
    }
  }
  return undefined;
}

function parseDescription(text: string): string | undefined {
  const match = text.match(DESCRIPTION_PATTERN);
  if (!match?.[1]) {
    return undefined;
  }
  const cleaned = match[1]
    .replace(/\b(?:pix|cart[aã]o|dinheiro|cr[eé]dito)\b/gi, "")
    .trim()
    .replace(/\s{2,}/g, " ")
    .replace(/\s+(?:no|na|nos|nas|em|de|da|do)$/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Parser debug para fala livre em PT-BR — heurísticas simples, não produção. */
export function parseExpenseUtterance(text: string): ExpenseUtteranceParse {
  const rawText = text.trim();
  return {
    rawText,
    amount: parseAmount(rawText),
    description: parseDescription(rawText),
    paymentMethod: parsePaymentMethod(rawText),
  };
}
