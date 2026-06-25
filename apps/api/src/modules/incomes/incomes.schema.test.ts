import { describe, expect, it } from "@jest/globals";
import { createIncomeBodySchema, listIncomesQuerySchema } from "./incomes.schema.js";

describe("createIncomeBodySchema", () => {
  it("rejeita valores não positivos", () => {
    const result = createIncomeBodySchema.safeParse({
      amount: 0,
      description: "Zero",
    });

    expect(result.success).toBe(false);
  });

  it("aceita valores positivos", () => {
    const result = createIncomeBodySchema.safeParse({
      amount: 3500,
      description: "Salário",
      source: "salary",
    });

    expect(result.success).toBe(true);
  });

  it("exige descrição", () => {
    const result = createIncomeBodySchema.safeParse({
      amount: 100,
      description: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("listIncomesQuerySchema", () => {
  it("exige month e year juntos", () => {
    const onlyYear = listIncomesQuerySchema.safeParse({ year: 2025 });
    expect(onlyYear.success).toBe(false);

    const both = listIncomesQuerySchema.safeParse({ month: 3, year: 2025 });
    expect(both.success).toBe(true);
  });

  it("aceita tagIds como CSV", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const result = listIncomesQuerySchema.safeParse({ tagIds: id });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.tagIds).toEqual([id]);
  });
});
