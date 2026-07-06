import type { GoalCategory } from "@money-manager/types";
import { normalizeToken } from "../utils/normalize-text.js";

export type ExpenseEditPatch = {
  field:
    | "amount"
    | "description"
    | "goalCategory"
    | "tags"
    | "paymentMethod";
  value: number | string | string[] | GoalCategory | "credit_card" | "pix" | "cash";
  literal?: boolean;
};

export type ParsedExpenseEdit = {
  rawText: string;
  itemIndex?: number;
  patches: ExpenseEditPatch[];
  isValid: boolean;
};

const EDIT_FIELD_ALIASES: Record<string, ExpenseEditPatch["field"]> = {
  valor: "amount",
  descricao: "description",
  desc: "description",
  categoria: "goalCategory",
  cat: "goalCategory",
  tags: "tags",
  pagamento: "paymentMethod",
  payment: "paymentMethod",
};

const PAYMENT_VALUE_ALIASES: Record<string, ExpenseEditPatch["value"]> = {
  pix: "pix",
  dinheiro: "cash",
  cash: "cash",
  cartao: "credit_card",
  credito: "credit_card",
};

function parseAmount(raw: string): number | undefined {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function parseLine(line: string): {
  itemIndex?: number;
  body: string;
} | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("*")) {
    return null;
  }
  const batch = /^\*(\d+)\s+(.+)$/.exec(trimmed);
  if (batch) {
    return {
      itemIndex: Number.parseInt(batch[1]!, 10),
      body: batch[2]!.trim(),
    };
  }
  const body = trimmed.slice(1).trim();
  return body ? { body } : null;
}

function parseEditFieldHeader(
  body: string,
): { field: ExpenseEditPatch["field"]; itemIndex?: number } | null {
  const batch = /^(\d+)\s+(.+)$/i.exec(body.trim());
  const rest = batch ? batch[2]!.trim() : body.trim();
  const itemIndex = batch ? Number.parseInt(batch[1]!, 10) : undefined;
  const field = EDIT_FIELD_ALIASES[normalizeToken(rest)];
  if (!field) {
    return null;
  }
  return { field, itemIndex };
}

function buildPatchFromField(
  field: ExpenseEditPatch["field"],
  valueLine: string,
): ExpenseEditPatch | null {
  const value = valueLine.trim();
  if (!value) {
    return null;
  }

  if (field === "amount") {
    const amount = parseAmount(value);
    if (amount === undefined) {
      return null;
    }
    return { field: "amount", value: amount };
  }

  if (field === "description") {
    return { field: "description", value, literal: true };
  }

  if (field === "goalCategory") {
    return { field: "goalCategory", value };
  }

  if (field === "paymentMethod") {
    const method = PAYMENT_VALUE_ALIASES[normalizeToken(value)];
    if (!method) {
      return null;
    }
    return { field: "paymentMethod", value: method };
  }

  if (field === "tags") {
    const tagsMatch = /^tags:\s*(.+)$/i.exec(value);
    const raw = tagsMatch ? tagsMatch[1]! : value;
    const names = raw
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    return { field: "tags", value: names };
  }

  return null;
}

export function parseExpenseEditText(text: string): ParsedExpenseEdit {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const patches: ExpenseEditPatch[] = [];
  let itemIndex: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.startsWith("*")) {
      continue;
    }

    const parsedLine = parseLine(line);
    if (!parsedLine) {
      continue;
    }

    if (parsedLine.itemIndex !== undefined) {
      itemIndex = parsedLine.itemIndex;
    }

    const fieldHeader = parseEditFieldHeader(parsedLine.body);
    const nextLine = lines[i + 1]?.trim();
    if (!fieldHeader || !nextLine || nextLine.startsWith("*")) {
      continue;
    }

    const patch = buildPatchFromField(fieldHeader.field, nextLine);
    if (!patch) {
      continue;
    }

    if (fieldHeader.itemIndex !== undefined) {
      itemIndex = fieldHeader.itemIndex;
    }
    patches.push(patch);
    i += 1;
  }

  return {
    rawText: text,
    itemIndex,
    patches,
    isValid: patches.length > 0,
  };
}
