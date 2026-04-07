import { describe, expect, it } from "vitest";
import type { Expense } from "./domain/expense.js";

describe("@money-manager/types", () => {
  it("loads domain types", () => {
    const _e: Expense | undefined = undefined;
    expect(_e).toBeUndefined();
  });
});
