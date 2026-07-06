import { describe, expect, it } from "@jest/globals";
import { parseExpenseEditText } from "./parse-expense-edit.js";

describe("parseExpenseEditText", () => {
  it("parses two-line field edits", () => {
    const parsed = parseExpenseEditText("*valor\n100,50");
    expect(parsed.patches).toEqual([{ field: "amount", value: 100.5 }]);
  });

  it("parses two-line batch field edits", () => {
    const parsed = parseExpenseEditText("*2 valor\n100,35");
    expect(parsed.itemIndex).toBe(2);
    expect(parsed.patches).toEqual([{ field: "amount", value: 100.35 }]);
  });

  it("parses two-line category and description edits", () => {
    const parsed = parseExpenseEditText("*categoria\nprazeres\n*descrição\nmercado");
    expect(parsed.patches).toEqual([
      { field: "goalCategory", value: "prazeres" },
      { field: "description", value: "mercado", literal: true },
    ]);
  });

  it("rejects old single-line inline format", () => {
    const parsed = parseExpenseEditText("*2 100,35");
    expect(parsed.isValid).toBe(false);
    expect(parsed.patches).toHaveLength(0);
  });
});
