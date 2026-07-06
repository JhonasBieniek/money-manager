import type { GoalCategory } from "@money-manager/types";
import type { BotUserContextResponse } from "@money-manager/types";
import { normalizeToken } from "../utils/normalize-text.js";

export type ResolveGoalResult =
  | { ok: true; category: GoalCategory }
  | {
      ok: false;
      reason: "invalid_number" | "unknown_name" | "ambiguous";
      candidates?: GoalCategory[];
    };

function activeGoals(context: BotUserContextResponse) {
  return context.goals.filter((goal) => goal.isActive);
}

export function resolveGoalCategory(
  input: string,
  context: BotUserContextResponse,
): ResolveGoalResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "unknown_name" };
  }

  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10);
    const goal = activeGoals(context).find((item) => item.index === index);
    if (!goal) {
      return { ok: false, reason: "invalid_number" };
    }
    return { ok: true, category: goal.category };
  }

  const normalizedInput = normalizeToken(trimmed);
  const goals = activeGoals(context);
  const exact = goals.filter(
    (goal) =>
      normalizeToken(goal.label) === normalizedInput ||
      normalizeToken(goal.category) === normalizedInput,
  );
  if (exact.length === 1) {
    return { ok: true, category: exact[0]!.category };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: exact.map((goal) => goal.category),
    };
  }

  const prefix = goals.filter((goal) => {
    const label = normalizeToken(goal.label);
    const slug = normalizeToken(goal.category);
    return (
      label.startsWith(normalizedInput) || slug.startsWith(normalizedInput)
    );
  });
  if (prefix.length === 1) {
    return { ok: true, category: prefix[0]!.category };
  }
  if (prefix.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: prefix.map((goal) => goal.category),
    };
  }

  const contains = goals.filter((goal) => {
    const label = normalizeToken(goal.label);
    const slug = normalizeToken(goal.category);
    return label.includes(normalizedInput) || slug.includes(normalizedInput);
  });
  if (contains.length === 1) {
    return { ok: true, category: contains[0]!.category };
  }
  if (contains.length > 1) {
    return {
      ok: false,
      reason: "ambiguous",
      candidates: contains.map((goal) => goal.category),
    };
  }

  return { ok: false, reason: "unknown_name" };
}
