import { describe, expect, it } from "vitest";
import { createExpenseSchema } from "./expenses.schema.js";

describe("expenses.schema", () => {
  it("deve rejeitar valores negativos", () => {
    const result = createExpenseSchema.safeParse({
      amount: -10,
      description: "Negativo",
      paymentMethodIndex: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe("O valor não pode ser negativo");
    }
  });

  it("deve aceitar valor zero", () => {
    const result = createExpenseSchema.safeParse({
      amount: 0,
      description: "Zero",
      paymentMethodIndex: 0,
      goalCategory: "custos-fixos",
    });

    expect(result.success).toBe(true);
  });

  it("deve aceitar valores positivos", () => {
    const result = createExpenseSchema.safeParse({
      amount: 129.90,
      description: "Normal",
      paymentMethodIndex: 1,
      goalCategory: "conforto",
    });

    expect(result.success).toBe(true);
  });

  it("deve exigir descrição", () => {
    const result = createExpenseSchema.safeParse({
      amount: 10,
      description: "",
      paymentMethodIndex: 0,
      goalCategory: "custos-fixos",
    });

    expect(result.success).toBe(false);
  });
});
