export type ExpenseUtteranceItem = {
  amount?: number;
  description?: string;
  paymentMethod?: "cash" | "credit_card" | "pix";
};

export type ExpenseUtterancesParse = {
  rawText: string;
  items: ExpenseUtteranceItem[];
  paymentMethod?: ExpenseUtteranceItem["paymentMethod"];
};

const AMOUNT_PATTERNS = [
  /r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i,
  /(\d+(?:[.,]\d{1,2})?)\s*reais?/i,
];

const ITEM_PATTERN =
  /(\d+(?:[.,]\d{1,2})?)\s*reais?(?:\s*(?:em|no|na|nos|nas|de|da|do))?\s*([a-zà-ú0-9][\wà-ú\s-]{0,40})/gi;

const PAYMENT_PATTERNS: Array<{
  pattern: RegExp;
  method: ExpenseUtteranceItem["paymentMethod"];
}> = [
  { pattern: /\bpix\b/i, method: "pix" },
  { pattern: /\bcart[aã]o(?:\s+de\s+cr[eé]dito)?\b/i, method: "credit_card" },
  { pattern: /\bdinheiro\b|\bem\s+esp[eé]cie\b/i, method: "cash" },
];

function parseAmountFromSegment(text: string): number | undefined {
  const brl = text.match(
    /r\$\s*(\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+(?:,\d{1,2})?)/i
  );
  if (brl?.[1]) {
    const normalized = brl[1].replace(/\./g, "").replace(",", ".");
    const value = Number.parseFloat(normalized);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

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

function parsePaymentMethod(text: string): ExpenseUtteranceItem["paymentMethod"] | undefined {
  for (const { pattern, method } of PAYMENT_PATTERNS) {
    if (pattern.test(text)) {
      return method;
    }
  }
  return undefined;
}

function cleanDescription(raw: string): string | undefined {
  const cleaned = raw
    .replace(/\b(?:pix|cart[aã]o|dinheiro|cr[eé]dito)\b/gi, "")
    .trim()
    .replace(/\s{2,}/g, " ")
    .replace(/\s+(?:no|na|nos|nas|em|de|da|do)$/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseSegment(segment: string): ExpenseUtteranceItem | null {
  const trimmed = segment.trim();
  if (!trimmed) {
    return null;
  }
  const amount = parseAmountFromSegment(trimmed);
  const itemPattern =
    /(\d+(?:[.,]\d{1,2})?)\s*reais?(?:\s*(?:em|no|na|nos|nas|de|da|do))?\s*([a-zà-ú0-9][\wà-ú\s-]{0,40})/i;
  const match = trimmed.match(itemPattern);
  let description = match?.[2] ? cleanDescription(match[2]) : undefined;
  if (!description && amount !== undefined) {
    const afterMoney = trimmed.match(
      /(?:r\$\s*[\d.,]+|\d+(?:[.,]\d+)?\s*reais?)\s*(?:em|no|na|nos|nas|de|da|do)?\s*([a-zà-ú0-9][\wà-ú\s-]{0,40})/i
    );
    if (afterMoney?.[1]) {
      description = cleanDescription(afterMoney[1]);
    }
  }
  const paymentMethod = parsePaymentMethod(trimmed);

  if (amount === undefined && !description) {
    const descOnly = trimmed.match(
      /\b(?:no|na|nos|nas|em|de|da|do)\s+([a-zà-ú0-9][\wà-ú\s-]{1,40})/i
    );
    const onlyDescription = descOnly?.[1] ? cleanDescription(descOnly[1]) : undefined;
    if (!onlyDescription) {
      return null;
    }
    return { description: onlyDescription, ...(paymentMethod ? { paymentMethod } : {}) };
  }

  return {
    amount,
    description,
    ...(paymentMethod ? { paymentMethod } : {}),
  };
}

function splitSegments(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const byComma = normalized.split(/\s*[,;]\s*(?=\d+(?:[.,]\d+)?\s*reais)/i);
  if (byComma.length > 1) {
    return byComma;
  }
  const byDot = normalized.split(/\.\s+(?=\d)/);
  if (byDot.length > 1) {
    return byDot;
  }
  const byE = normalized.split(/\s+e\s+(?=\d)/i);
  if (byE.length > 1) {
    return byE;
  }
  return [normalized];
}

function scanAllItems(text: string): ExpenseUtteranceItem[] {
  const items: ExpenseUtteranceItem[] = [];
  const globalPayment = parsePaymentMethod(text);

  for (const match of text.matchAll(ITEM_PATTERN)) {
    const amount = parseAmountFromSegment(match[0]);
    const description = match[2] ? cleanDescription(match[2]) : undefined;
    if (amount === undefined) {
      continue;
    }
    items.push({
      amount,
      description,
      paymentMethod: parsePaymentMethod(match[0]) ?? globalPayment,
    });
  }

  return items;
}

function mergePaymentMethod(
  items: ExpenseUtteranceItem[],
  global?: ExpenseUtteranceItem["paymentMethod"]
): ExpenseUtteranceItem[] {
  if (!global) {
    return items;
  }
  return items.map((item) => ({
    ...item,
    paymentMethod: item.paymentMethod ?? global,
  }));
}

/** Parser para fala livre em PT-BR — suporta múltiplas despesas na mesma frase. */
export function parseExpenseUtterances(text: string): ExpenseUtterancesParse {
  const rawText = text.trim();
  const globalPayment = parsePaymentMethod(rawText);
  const segments = splitSegments(rawText);

  let items: ExpenseUtteranceItem[] = [];
  for (const segment of segments) {
    const parsed = parseSegment(segment);
    if (parsed) {
      items.push(parsed);
    }
  }

  const reaisCount = (rawText.match(/\d+(?:[.,]\d{1,2})?\s*reais?/gi) ?? []).length;
  if (items.length <= 1 && reaisCount > 1) {
    items = scanAllItems(rawText);
  } else if (items.length === 0) {
    items = scanAllItems(rawText);
  }

  items = mergePaymentMethod(items, globalPayment);

  return {
    rawText,
    items,
    ...(globalPayment ? { paymentMethod: globalPayment } : {}),
  };
}

/** Compat: retorna o primeiro item como objeto único. */
export function parseExpenseUtterance(text: string): ExpenseUtteranceItem & { rawText: string } {
  const parsed = parseExpenseUtterances(text);
  const first = parsed.items[0] ?? {};
  return {
    rawText: parsed.rawText,
    amount: first.amount,
    description: first.description,
    paymentMethod: first.paymentMethod ?? parsed.paymentMethod,
  };
}
