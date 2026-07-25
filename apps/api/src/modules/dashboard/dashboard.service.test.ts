import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const dbMock = {
  select: jest.fn(),
};

const getGoalUsageMock = jest.fn();

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  incomes: {
    userId: "user_id",
    amountCents: "amount_cents",
    deletedAt: "deleted_at",
    occurredAt: "occurred_at",
  },
  expenses: {
    userId: "user_id",
    amountCents: "amount_cents",
    goalCategory: "goal_category",
    paymentMethod: "payment_method",
    deletedAt: "deleted_at",
    occurredAt: "occurred_at",
  },
  creditCardStatements: {
    userId: "user_id",
    cycleYear: "cycle_year",
    cycleMonth: "cycle_month",
    calculatedTotalCents: "calculated_total_cents",
    adjustedTotalCents: "adjusted_total_cents",
  },
}));

jest.unstable_mockModule("../goals/goals.service.js", () => ({
  getGoalUsage: getGoalUsageMock,
}));

jest.unstable_mockModule("../debts/debts.service.js", () => ({
  syncUserDebtsForMonth: jest.fn().mockResolvedValue(undefined),
}));

const dashboardService = await import("./dashboard.service.js");

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

describe("getDashboardSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getGoalUsageMock.mockResolvedValue([
      {
        category: "prazeres",
        percentageValue: 10,
        ceiling: 100_000,
        spent: 25_000,
        usagePercent: 25,
      },
    ]);
  });

  it("agrega totais, expensesByCategory e goalsUsage usando o total da fatura para cartão", async () => {
    const responses = [
      [{ total: 1_000_000 }], // incomes
      [{ total: 250_000 }], // expenses (não-cartão)
      [{ total: 150_000 }], // faturas do mês (creditCardStatements)
      [
        { category: "prazeres", total: 250_000 },
        { category: "custos-fixos", total: 150_000 },
      ], // expensesByCategory (inclui cartão, sem mudança)
    ];
    let callIndex = 0;
    dbMock.select.mockImplementation(() => {
      const response = responses[callIndex++] ?? [];
      return chainWhere(response, callIndex === 4);
    });

    const summary = await dashboardService.getDashboardSummary("user-1", 2025, 6);

    expect(summary.totalIncomes).toBe(1_000_000);
    expect(summary.totalExpenses).toBe(400_000);
    expect(summary.balance).toBe(600_000);
    expect(summary.expensesByCategory).toEqual([
      { category: "Prazeres", amount: 250_000 },
      { category: "Custos Fixos", amount: 150_000 },
    ]);
    expect(summary.goalsUsage).toHaveLength(1);
    expect(summary.goalsUsage[0]?.spent).toBe(25_000);
    expect(getGoalUsageMock).toHaveBeenCalledWith("user-1", 2025, 6);
    expect(dbMock.select).toHaveBeenCalledTimes(4);
  });
});

describe("getDashboardHistory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2025, 5, 15));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retorna meses com totais agregados, somando faturas de cartão por ciclo", async () => {
    const incomeRows = [
      { year: 2025, monthNum: 4, total: 500_000 },
      { year: 2025, monthNum: 5, total: 800_000 },
      { year: 2025, monthNum: 6, total: 1_000_000 },
    ];
    const expenseRows = [
      { year: 2025, monthNum: 4, total: 300_000 },
      { year: 2025, monthNum: 5, total: 600_000 },
      { year: 2025, monthNum: 6, total: 100_000 },
    ];
    const cardStatementRows = [{ year: 2025, monthNum: 6, total: 70_000 }];

    let callIndex = 0;
    dbMock.select.mockImplementation(() => {
      const response =
        callIndex === 0
          ? incomeRows
          : callIndex === 1
            ? expenseRows
            : cardStatementRows;
      callIndex++;
      return {
        from: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(response),
          }),
        }),
      };
    });

    const history = await dashboardService.getDashboardHistory("user-1", 3);

    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({
      month: "2025-04",
      incomes: 500_000,
      expenses: 300_000,
      balance: 200_000,
    });
    expect(history[1]).toMatchObject({
      month: "2025-05",
      incomes: 800_000,
      expenses: 600_000,
      balance: 200_000,
    });
    expect(history[2]).toMatchObject({
      month: "2025-06",
      incomes: 1_000_000,
      expenses: 170_000,
      balance: 830_000,
    });
    expect(dbMock.select).toHaveBeenCalledTimes(3);
  });
});
