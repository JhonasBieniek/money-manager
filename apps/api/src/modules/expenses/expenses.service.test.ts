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

const expensesService = await import("./expenses.service.js");

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
