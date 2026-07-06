import type { GoalCategory } from "@money-manager/types";
import { normalizeToken } from "../utils/normalize-text.js";

export type ExpenseTextPatch = {
  field:
    | "amount"
    | "description"
    | "goalCategory"
    | "tags"
    | "paymentMethod"
    | "creditCard";
  value: number | string | string[] | GoalCategory | "credit_card" | "pix" | "cash";
  /** Quando true, não tenta resolver categoria a partir da descrição. */
  literal?: boolean;
};

const EDIT_FIELD_ALIASES: Record<string, ExpenseTextPatch["field"]> = {
  valor: "amount",
  descricao: "description",
  desc: "description",
  categoria: "goalCategory",
  cat: "goalCategory",
  tags: "tags",
};

export type ParsedExpenseText = {
  rawText: string;
  itemIndex?: number;
  patches: ExpenseTextPatch[];
  isStructured: boolean;
};

const ITEM_PREFIX = /^\*(\d+)\s+(.+)$/;

function parseAmount(raw: string): number | undefined {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function parsePaymentKeyword(value: string): ExpenseTextPatch["value"] | undefined {
  const token = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  if (token === "pix") return "pix";
  if (token === "dinheiro" || token === "cash") return "cash";
  if (
    token === "cartao" ||
    token === "cartão" ||
    token === "credito" ||
    token === "crédito"
  ) {
    return "credit_card";
  }
  return undefined;
}

function parseLine(line: string): {
  itemIndex?: number;
  body: string;
} | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("*")) {
    return null;
  }
  const withoutStar = trimmed.slice(1).trim();
  if (!withoutStar) {
    return null;
  }
  const batch = ITEM_PREFIX.exec(trimmed);
  if (batch) {
    return {
      itemIndex: Number.parseInt(batch[1]!, 10),
      body: batch[2]!.trim(),
    };
  }
  return { body: withoutStar };
}

function parseEditFieldHeader(
  body: string,
): { field: ExpenseTextPatch["field"]; itemIndex?: number } | null {
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
  field: ExpenseTextPatch["field"],
  valueLine: string,
): ExpenseTextPatch | null {
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

function parseStructuredLine(body: string): ExpenseTextPatch | null {
  const tagsMatch = /^tags:\s*(.+)$/i.exec(body);
  if (tagsMatch) {
    const names = tagsMatch[1]!
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    return { field: "tags", value: names };
  }

  const amount = parseAmount(body);
  if (amount !== undefined && /^[\d.,]+$/.test(body.replace(/\s/g, ""))) {
    return { field: "amount", value: amount };
  }

  const payment = parsePaymentKeyword(body);
  if (payment) {
    return { field: "paymentMethod", value: payment };
  }

  return { field: "description", value: body };
}

export function parseExpenseText(text: string): ParsedExpenseText {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const structuredLines = lines.filter((line) => line.startsWith("*"));
  const patches: ExpenseTextPatch[] = [];
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
    if (fieldHeader && nextLine && !nextLine.startsWith("*")) {
      const patch = buildPatchFromField(fieldHeader.field, nextLine);
      if (patch) {
        if (fieldHeader.itemIndex !== undefined) {
          itemIndex = fieldHeader.itemIndex;
        }
        patches.push(patch);
        i += 1;
        continue;
      }
    }

    const patch = parseStructuredLine(parsedLine.body);
    if (patch) {
      patches.push(patch);
    }
  }

  return {
    rawText: text,
    itemIndex,
    patches,
    isStructured: structuredLines.length > 0,
  };
}

export function hasStructuredLines(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim().startsWith("*"));
}
