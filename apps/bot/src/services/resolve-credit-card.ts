import type { BotUserContextResponse } from "@money-manager/types";
import { normalizeToken } from "../utils/normalize-text.js";

export type ResolveCreditCardResult =
  | { ok: true; creditCardId: string }
  | {
      ok: false;
      reason: "invalid_number" | "unknown_name" | "ambiguous";
      candidates?: string[];
    };

export function resolveCreditCard(
  input: string,
  context: BotUserContextResponse,
): ResolveCreditCardResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "unknown_name" };
  }

  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10);
    const card = context.creditCards.find((item) => item.index === index);
    if (!card) {
      return { ok: false, reason: "invalid_number" };
    }
    return { ok: true, creditCardId: card.id };
  }

  const normalizedInput = normalizeToken(trimmed);
  const exact = context.creditCards.filter(
    (card) => normalizeToken(card.name) === normalizedInput,
  );
  if (exact.length === 1) {
    return { ok: true, creditCardId: exact[0]!.id };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: exact.map((card) => card.name),
    };
  }

  const prefix = context.creditCards.filter((card) =>
    normalizeToken(card.name).startsWith(normalizedInput),
  );
  if (prefix.length === 1) {
    return { ok: true, creditCardId: prefix[0]!.id };
  }
  if (prefix.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: prefix.map((card) => card.name),
    };
  }

  return { ok: false, reason: "unknown_name" };
}
