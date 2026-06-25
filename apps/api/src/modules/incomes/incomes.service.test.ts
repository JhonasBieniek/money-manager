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
  incomes: {
    id: "id",
    userId: "user_id",
    amountCents: "amount_cents",
    description: "description",
    source: "source",
    occurredAt: "occurred_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
  incomeTags: {
    incomeId: "income_id",
    tagId: "tag_id",
  },
}));

jest.unstable_mockModule("@money-manager/utils", () => ({
  newId: () => "mocked-income-id",
}));

jest.unstable_mockModule("../tags/tags.service.js", () => ({
  assertTagsBelongToUser: jest.fn().mockResolvedValue(undefined),
}));

const incomesService = await import("./incomes.service.js");

describe("createIncome", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("cria receita com valor em centavos", async () => {
    const now = new Date();
    dbMock.transaction.mockImplementation(async (cb) => {
      const tx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: "mocked-income-id",
                userId: "user-1",
                amountCents: 350000,
                description: "Salário",
                source: "salary",
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
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    const result = await incomesService.createIncome("user-1", {
      amount: 3500,
      description: "Salário",
      source: "salary",
    });

    expect(result.amountCents).toBe(350000);
    expect(result.id).toBe("mocked-income-id");
  });
});

describe("deleteIncome", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("faz soft delete", async () => {
    const now = new Date();
    const setMock = jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });

    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: () =>
              Promise.resolve([
                {
                  id: "inc-1",
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
    });
    dbMock.update.mockReturnValue({ set: setMock });

    await incomesService.deleteIncome("user-1", "inc-1");

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    );
  });

  it("lança NotFoundError quando receita não existe", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: () => Promise.resolve([]),
          }),
        }),
      }),
    });

    await expect(
      incomesService.deleteIncome("user-1", "missing"),
    ).rejects.toThrow(NotFoundError);
  });
});
