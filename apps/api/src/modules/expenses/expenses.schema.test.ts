import { describe, expect, it } from "@jest/globals";
import {
  createExpenseBodySchema,
  listExpensesQuerySchema,
} from "./expenses.schema.js";

describe("createExpenseBodySchema", () => {
  it("rejeita valores negativos", () => {
    const result = createExpenseBodySchema.safeParse({
      amount: -10,
      description: "Negativo",
      goalCategory: "custos-fixos",
      paymentMethodIndex: 0,
    });

    expect(result.success).toBe(false);
  });

  it("aceita valor zero", () => {
    const result = createExpenseBodySchema.safeParse({
      amount: 0,
      description: "Zero",
      goalCategory: "custos-fixos",
      paymentMethodIndex: 0,
    });

    expect(result.success).toBe(true);
  });

  it("aceita valores positivos", () => {
    const result = createExpenseBodySchema.safeParse({
      amount: 129.9,
      description: "Normal",
      goalCategory: "conforto",
      paymentMethodIndex: 1,
    });

    expect(result.success).toBe(true);
  });

  it("exige descrição", () => {
    const result = createExpenseBodySchema.safeParse({
      amount: 10,
      description: "",
      goalCategory: "custos-fixos",
      paymentMethodIndex: 0,
    });

    expect(result.success).toBe(false);
  });

  it("aceita occurredAt em ISO 8601", () => {
    const result = createExpenseBodySchema.safeParse({
      amount: 50,
      description: "Almoço",
      goalCategory: "prazeres",
      paymentMethodIndex: 2,
      occurredAt: "2025-06-15T12:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });
});

describe("listExpensesQuerySchema", () => {
  it("aceita tagIds como CSV ou array", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const csv = listExpensesQuerySchema.safeParse({ tagIds: id });
    expect(csv.success).toBe(true);
    if (csv.success) expect(csv.data.tagIds).toEqual([id]);

    const array = listExpensesQuerySchema.safeParse({ tagIds: [id] });
    expect(array.success).toBe(true);
  });

  it("exige month e year juntos", () => {
    const onlyYear = listExpensesQuerySchema.safeParse({ year: 2025 });
    expect(onlyYear.success).toBe(false);
  });
});
