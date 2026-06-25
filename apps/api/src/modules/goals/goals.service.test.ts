import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { BadRequestError } from "../../shared/errors/app-error.js";

const dbMock = {
  select: jest.fn(),
  insert: jest.fn(),
  delete: jest.fn(),
  transaction: jest.fn(),
};

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  goals: {
    id: "id",
    userId: "user_id",
    category: "category",
    percentage: "percentage",
    isActive: "is_active",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  expenses: {
    userId: "user_id",
    amountCents: "amount_cents",
    goalCategory: "goal_category",
    deletedAt: "deleted_at",
    occurredAt: "occurred_at",
  },
  incomes: {
    userId: "user_id",
    amountCents: "amount_cents",
    deletedAt: "deleted_at",
    occurredAt: "occurred_at",
  },
}));

jest.unstable_mockModule("@money-manager/utils", () => ({
  newId: () => "goal-id-1",
}));

const goalsService = await import("./goals.service.js");

function chainWhere<T>(value: T, grouped = false) {
  if (grouped) {
    return {
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve(value),
        }),
      }),
    };
  }
  return {
    from: () => ({
      where: () => Promise.resolve(value),
    }),
  };
}

const defaultGoalsPayload = {
  goals: [
    { category: "liberdade-financeira", percentage: 10 },
    { category: "custos-fixos", percentage: 40 },
    { category: "conforto", percentage: 10 },
    { category: "metas", percentage: 20 },
    { category: "prazeres", percentage: 10 },
    { category: "conhecimento", percentage: 10 },
  ],
} as const;

describe("upsertGoals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejeita soma diferente de 100%", async () => {
    await expect(
      goalsService.upsertGoals("user-1", {
        goals: defaultGoalsPayload.goals.map((goal, index) =>
          index === 0 ? { ...goal, percentage: 5 } : goal,
        ),
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("getGoalUsage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna ceiling e spent zerados sem transações", async () => {
    const now = new Date();
    const responses = [
      [
        {
          id: "goal-1",
          userId: "user-1",
          category: "prazeres",
          percentage: "20",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      [{ total: 0 }],
      [],
    ];
    let callIndex = 0;
    dbMock.select.mockImplementation(() => {
      const response = responses[callIndex++] ?? [];
      return chainWhere(response, callIndex === 3);
    });

    const usage = await goalsService.getGoalUsage("user-1", 2025, 6);

    expect(usage).toHaveLength(1);
    expect(usage[0]?.ceiling).toBe(0);
    expect(usage[0]?.spent).toBe(0);
    expect(usage[0]?.usagePercent).toBe(0);
  });

  it("agrega spent por goal_category", async () => {
    const now = new Date();
    const responses = [
      [
        {
          id: "goal-1",
          userId: "user-1",
          category: "prazeres",
          percentage: "20",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      [{ total: 0 }],
      [{ category: "prazeres", total: 50_000 }],
    ];
    let callIndex = 0;
    dbMock.select.mockImplementation(() => {
      const response = responses[callIndex++] ?? [];
      return chainWhere(response, callIndex === 3);
    });

    const usage = await goalsService.getGoalUsage("user-1", 2025, 6);

    expect(usage).toHaveLength(1);
    expect(usage[0]?.ceiling).toBe(0);
    expect(usage[0]?.spent).toBe(50_000);
    expect(usage[0]?.usagePercent).toBe(100);
  });
});
