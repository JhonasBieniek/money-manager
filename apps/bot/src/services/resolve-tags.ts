import type { BotUserContextResponse } from "@money-manager/types";
import { normalizeToken } from "../utils/normalize-text.js";

export type ResolveTagsResult =
  | { ok: true; tagIds: string[] }
  | {
      ok: false;
      reason: "unknown" | "ambiguous";
      unknown?: string[];
      ambiguous?: Array<{ input: string; candidates: string[] }>;
    };

function tokenize(input: string): string[] {
  return input
    .split(/[,;]+|\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function isSkipInput(input: string): boolean {
  const normalized = normalizeToken(input);
  return normalized === "pular" || normalized === "-" || normalized === "skip";
}

function resolveSingleToken(
  token: string,
  context: BotUserContextResponse,
): { ok: true; tagId: string } | { ok: false; reason: "unknown" | "ambiguous"; candidates?: string[] } {
  if (/^\d+$/.test(token)) {
    const index = Number.parseInt(token, 10);
    const tag = context.tags.find((item) => item.index === index);
    if (!tag) {
      return { ok: false, reason: "unknown" };
    }
    return { ok: true, tagId: tag.id };
  }

  const normalizedInput = normalizeToken(token);
  const exact = context.tags.filter(
    (tag) => normalizeToken(tag.name) === normalizedInput,
  );
  if (exact.length === 1) {
    return { ok: true, tagId: exact[0]!.id };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: exact.map((tag) => tag.name),
    };
  }

  const prefix = context.tags.filter((tag) =>
    normalizeToken(tag.name).startsWith(normalizedInput),
  );
  if (prefix.length === 1) {
    return { ok: true, tagId: prefix[0]!.id };
  }
  if (prefix.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: prefix.map((tag) => tag.name),
    };
  }

  const contains = context.tags.filter((tag) =>
    normalizeToken(tag.name).includes(normalizedInput),
  );
  if (contains.length === 1) {
    return { ok: true, tagId: contains[0]!.id };
  }
  if (contains.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: contains.map((tag) => tag.name),
    };
  }

  return { ok: false, reason: "unknown" };
}

export function resolveTags(
  input: string | string[],
  context: BotUserContextResponse,
): ResolveTagsResult {
  if (typeof input === "string" && isSkipInput(input)) {
    return { ok: true, tagIds: [] };
  }

  const tokens = Array.isArray(input) ? input : tokenize(input);
  if (tokens.length === 0) {
    return { ok: true, tagIds: [] };
  }

  const tagIds: string[] = [];
  const unknown: string[] = [];
  const ambiguous: Array<{ input: string; candidates: string[] }> = [];

  for (const token of tokens) {
    const result = resolveSingleToken(token, context);
    if (result.ok) {
      if (!tagIds.includes(result.tagId)) {
        tagIds.push(result.tagId);
      }
      continue;
    }
    if (result.reason === "ambiguous") {
      ambiguous.push({
        input: token,
        candidates: result.candidates ?? [],
      });
    } else {
      unknown.push(token);
    }
  }

  if (unknown.length > 0) {
    return { ok: false, reason: "unknown", unknown };
  }
  if (ambiguous.length > 0) {
    return { ok: false, reason: "ambiguous", ambiguous };
  }

  return { ok: true, tagIds };
}
