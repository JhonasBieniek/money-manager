import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NotFoundError } from "../../shared/errors/app-error.js";

const dbMock = {
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  transaction: jest.fn(),
};

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  expenses: {
    id: "id",
    userId: "user_id",
    goalCategory: "goal_category",
    amountCents: "amount_cents",
    description: "description",
    paymentMethod: "payment_method",
    cardLastFour: "card_last_four",
    creditCardId: "credit_card_id",
    creditCardStatementId: "credit_card_statement_id",
    source: "source",
    idempotencyKey: "idempotency_key",
    occurredAt: "occurred_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
  expenseTags: {
    expenseId: "expense_id",
    tagId: "tag_id",
  },
}));

jest.unstable_mockModule("@money-manager/utils", () => ({
  newId: () => "expense-id-1",
}));

jest.unstable_mockModule("../tags/tags.service.js", () => ({
  assertTagsBelongToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../credit-cards/credit-cards.service.js", () => ({
  assignExpenseToStatement: jest.fn().mockResolvedValue(undefined),
  recalculateStatementTotal: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../debts/debts.service.js", () => ({
  syncUserDebtsForMonth: jest.fn().mockResolvedValue(undefined),
}));

const expensesService = await import("./expenses.service.js");
const { resolveSyncMonthYear } = expensesService;

function chainLimit<T>(value: T) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(value),
      }),
    }),
  };
}

function chainSelectTagIds(value: unknown[] = []) {
  return {
    from: () => ({
      where: () => Promise.resolve(value),
    }),
  };
}

describe("createExpense", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cria despesa convertendo valor para centavos", async () => {
    const now = new Date();
    dbMock.transaction.mockImplementation(async (cb) => {
      const tx = {
        select: jest.fn().mockReturnValue(chainLimit([])),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: "expense-id-1",
                userId: "user-1",
                goalCategory: "custos-fixos",
                amountCents: 5050,
                description: "Almoço",
                paymentMethod: "cash",
                cardLastFour: null,
                source: "manual",
                idempotencyKey: null,
                occurredAt: now,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
              },
            ]),
          }),
        }),
      };
      return cb(tx);
    });
    dbMock.select.mockReturnValue(chainSelectTagIds([]));

    const result = await expensesService.createExpense("user-1", {
      amount: 50.5,
      description: "Almoço",
      goalCategory: "custos-fixos",
      paymentMethodIndex: 0,
    });

    expect(result.amountCents).toBe(5050);
    expect(result.goalCategory).toBe("custos-fixos");
  });

  it("retorna despesa existente quando idempotency key duplicada", async () => {
    const now = new Date();
    const existing = {
      id: "existing-id",
      userId: "user-1",
      goalCategory: "custos-fixos",
      amountCents: 2000,
      description: "Repetido",
      paymentMethod: "pix",
      cardLastFour: null,
      source: "manual",
      idempotencyKey: "key-123",
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    dbMock.transaction.mockImplementation(async (cb) => {
      const tx = {
        select: jest.fn().mockReturnValue(chainLimit([existing])),
      };
      return cb(tx);
    });
    dbMock.select.mockReturnValue(chainSelectTagIds([]));

    const result = await expensesService.createExpense("user-1", {
      amount: 20,
      description: "Repetido",
      goalCategory: "custos-fixos",
      paymentMethodIndex: 2,
      idempotencyKey: "key-123",
    });

    expect(result.id).toBe("existing-id");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("resolveSyncMonthYear", () => {
  it("usa year/month da query quando ambos informados", () => {
    const now = new Date("2026-06-15T15:00:00.000Z");
    const result = resolveSyncMonthYear(now, { year: 2020, month: 3 });
    expect(result).toEqual({ year: 2020, month: 3 });
  });

  it("usa o mês/ano BRT corrente quando query não informa, sem ambiguidade de fuso", () => {
    const now = new Date("2026-06-15T15:00:00.000Z"); // 12:00 BRT
    const result = resolveSyncMonthYear(now, {});
    expect(result).toEqual({ year: 2026, month: 6 });
  });

  it("usa o mês/ano BRT corrente mesmo quando UTC já virou o mês (fuso não-BRT)", () => {
    // 2026-02-01T01:00:00Z corresponde a 2026-01-31T22:00:00-03:00: já é
    // fevereiro em UTC, mas ainda é janeiro no horário de Brasília. Uma
    // implementação baseada em now.getFullYear()/getMonth() sem conversão
    // para BRT sincronizaria dívidas do mês errado (fevereiro) num host
    // não-BRT, deixando de sincronizar as despesas de janeiro.
    const originalTz = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const now = new Date("2026-02-01T01:00:00.000Z");
      const result = resolveSyncMonthYear(now, {});
      expect(result).toEqual({ year: 2026, month: 1 });
    } finally {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    }
  });
});

describe("deleteExpense", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("faz soft delete", async () => {
    const now = new Date();
    const setMock = jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });

    dbMock.transaction.mockImplementation(async (cb) => {
      const tx = {
        select: jest.fn().mockReturnValue({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: () =>
                  Promise.resolve([
                    {
                      id: "exp-1",
                      userId: "user-1",
                      deletedAt: null,
                      occurredAt: now,
                      createdAt: now,
                      updatedAt: now,
                    },
                  ]),
              }),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({ set: setMock }),
      };
      return cb(tx);
    });

    await expensesService.deleteExpense("user-1", "exp-1");

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });

  it("lança NotFoundError quando despesa não existe", async () => {
    dbMock.transaction.mockImplementation(async (cb) => {
      const tx = {
        select: jest.fn().mockReturnValue({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: () => Promise.resolve([]),
              }),
            }),
          }),
        }),
      };
      return cb(tx);
    });

    await expect(
      expensesService.deleteExpense("user-1", "missing"),
    ).rejects.toThrow(NotFoundError);
  });
});
