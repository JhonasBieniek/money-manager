import { describe, expect, it } from "@jest/globals";
import { upsertGoalsBodySchema } from "./goals.schema.js";

describe("upsertGoalsBodySchema", () => {
  const validGoals = [
    { category: "liberdade-financeira", percentage: 10 },
    { category: "custos-fixos", percentage: 40 },
    { category: "conforto", percentage: 10 },
    { category: "metas", percentage: 20 },
    { category: "prazeres", percentage: 10 },
    { category: "conhecimento", percentage: 10 },
  ] as const;

  it("aceita exatamente 6 categorias com percentuais válidos", () => {
    const result = upsertGoalsBodySchema.safeParse({ goals: validGoals });
    expect(result.success).toBe(true);
  });

  it("rejeita menos de 6 categorias", () => {
    const result = upsertGoalsBodySchema.safeParse({
      goals: validGoals.slice(0, 5),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita percentual negativo", () => {
    const result = upsertGoalsBodySchema.safeParse({
      goals: validGoals.map((goal, index) =>
        index === 0 ? { ...goal, percentage: -1 } : goal,
      ),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita percentual acima de 100", () => {
    const result = upsertGoalsBodySchema.safeParse({
      goals: validGoals.map((goal, index) =>
        index === 0 ? { ...goal, percentage: 101 } : goal,
      ),
    });
    expect(result.success).toBe(false);
  });
});
