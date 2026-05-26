import { beforeEach, describe, expect, it, vi } from "vitest";
import * as expensesService from "./expenses.service.js";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@money-manager/db", () => ({
  db: dbMock,
  expenses: {
    id: "id",
    idempotencyKey: "idempotency_key",
    deletedAt: "deleted_at",
  },
}));

vi.mock("@money-manager/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@money-manager/utils")>();
  return {
    ...actual,
    newId: () => "mocked-uuid",
  };
});

describe("expenses.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria despesa com valor em centavos", async () => {
    const input = {
      amount: 50.5,
      description: "Almoço",
      goalCategory: "custos-fixos" as const,
      paymentMethodIndex: 0 as const,
    };

    dbMock.transaction.mockImplementation(async (cb) => {
      const tx = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi
          .fn()
          .mockResolvedValue([
            { id: "mocked-uuid", amountCents: 5050, occurredAt: new Date() },
          ]),
      };
      return cb(tx);
    });

    const result = await expensesService.createExpense(input);
    expect(result.amountCents).toBe(5050);
    expect(result.id).toBe("mocked-uuid");
  });

  it("exclui despesa com soft delete", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "exp-1" }]),
    };
    dbMock.select.mockReturnValue(selectChain);

    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    dbMock.update.mockReturnValue(updateChain);

    await expensesService.deleteExpense("exp-1");

    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
    expect(updateChain.where).toHaveBeenCalled();
  });
});
