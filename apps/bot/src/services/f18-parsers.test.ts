import { describe, expect, it } from "@jest/globals";
import { parseExpenseText } from "./parse-expense-text.js";
import { resolveGoalCategory } from "./resolve-goal-category.js";
import { resolveTags } from "./resolve-tags.js";
import type { BotUserContextResponse } from "@money-manager/types";

const context: BotUserContextResponse = {
  userId: "u1",
  chatId: "1",
  goals: [
    { index: 1, category: "custos-fixos", label: "Custos Fixos", isActive: true },
    { index: 2, category: "prazeres", label: "Prazeres", isActive: true },
  ],
  tags: [
    { index: 1, id: "t1", name: "Mercado", parentId: null },
    { index: 2, id: "t2", name: "Trabalho", parentId: null },
  ],
  creditCards: [],
};

describe("parseExpenseText", () => {
  it("parses structured create lines", () => {
    const parsed = parseExpenseText("*150\n*mercado\n*prazeres");
    expect(parsed.patches).toEqual(
      expect.arrayContaining([
        { field: "amount", value: 150 },
        { field: "description", value: "mercado" },
      ]),
    );
  });
});

describe("resolveGoalCategory", () => {
  it("resolves number and name", () => {
    expect(resolveGoalCategory("2", context)).toEqual({
      ok: true,
      category: "prazeres",
    });
    expect(resolveGoalCategory("prazeres", context)).toEqual({
      ok: true,
      category: "prazeres",
    });
  });
});

describe("resolveTags", () => {
  it("resolves numeric multi-select", () => {
    expect(resolveTags("1,2", context)).toEqual({
      ok: true,
      tagIds: ["t1", "t2"],
    });
  });

  it("allows skip", () => {
    expect(resolveTags("pular", context)).toEqual({ ok: true, tagIds: [] });
  });
});
