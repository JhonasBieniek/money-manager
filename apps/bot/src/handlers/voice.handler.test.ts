import { describe, expect, it } from "vitest";
import { formatInsertSummary } from "../services/message-sync.service.js";
import { parseExpenseUtterances } from "../services/parse-expense-utterance.js";

describe("formatInsertSummary", () => {
  it("lists multiple inserted expenses", () => {
    const summary = formatInsertSummary(
      [
        { amount: 40, description: "manga" },
        { amount: 30, description: "maçã" },
      ],
      []
    );
    expect(summary).toContain("Inseridas 2 despesa(s)");
    expect(summary).toContain("manga");
    expect(summary).toContain("Categoria: pendente");
  });
});

describe("parseExpenseUtterances integration", () => {
  it("parses three items from sample phrase", () => {
    const parsed = parseExpenseUtterances(
      "40 reais em manga, 30 reais em maçã, 20 reais em banana"
    );
    expect(parsed.items).toHaveLength(3);
  });
});
