import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  ConflictError,
  NotFoundError,
} from "../../shared/errors/app-error.js";

const dbMock = {
  select: jest.fn(),
  insert: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  transaction: jest.fn(),
};

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  telegramAccounts: {
    id: "id",
    userId: "user_id",
    chatId: "chat_id",
    username: "username",
    linkedAt: "linked_at",
    revokedAt: "revoked_at",
  },
  telegramLinkTokens: {
    id: "id",
    userId: "user_id",
    token: "token",
    expiresAt: "expires_at",
    usedAt: "used_at",
    createdAt: "created_at",
  },
}));

jest.unstable_mockModule("@money-manager/utils", () => ({
  generateRefreshTokenPlain: () => "secure-link-token-abc123",
  newId: () => "token-row-id-1",
}));

const telegramService = await import("./telegram.service.js");

function chainLimit<T>(value: T) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(value),
      }),
    }),
  };
}

describe("createLinkToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbMock.delete.mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });
    dbMock.insert.mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });
  });

  it("gera token com expiração em 15 minutos e comando /start", async () => {
    process.env.TELEGRAM_BOT_USERNAME = "MoneyManagerBot";
    const before = Date.now();
    const result = await telegramService.createLinkToken("user-1");

    expect(result.token).toBe("secure-link-token-abc123");
    expect(result.startCommand).toBe("/start secure-link-token-abc123");
    expect(result.botUsername).toBe("MoneyManagerBot");
    expect(result.botDeepLink).toBe(
      "https://t.me/MoneyManagerBot?start=secure-link-token-abc123",
    );
    const expiresMs = new Date(result.expiresAt).getTime() - before;
    expect(expiresMs).toBeGreaterThanOrEqual(14 * 60 * 1000);
    expect(expiresMs).toBeLessThanOrEqual(16 * 60 * 1000);
    expect(dbMock.delete).toHaveBeenCalled();
    expect(dbMock.insert).toHaveBeenCalled();
  });
});

describe("linkAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejeita token expirado ou inexistente", async () => {
    dbMock.select.mockReturnValue(chainLimit([]));

    await expect(
      telegramService.linkAccount({
        token: "missing",
        chatId: "12345",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejeita token já usado", async () => {
    dbMock.select.mockReturnValue(chainLimit([]));

    await expect(
      telegramService.linkAccount({
        token: "used-token",
        chatId: "12345",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejeita chat_id já vinculado a outro usuário", async () => {
    const now = new Date();
    dbMock.select.mockReturnValue(
      chainLimit([
        {
          id: "tok-1",
          userId: "user-1",
          token: "valid-token",
          expiresAt: new Date(now.getTime() + 60_000),
          usedAt: null,
        },
      ]),
    );

    dbMock.transaction.mockImplementation(
      async (
        cb: (tx: {
          select: typeof dbMock.select;
          insert: typeof dbMock.insert;
          update: typeof dbMock.update;
        }) => Promise<void>,
      ) => {
        const tx = {
          select: jest
            .fn()
            .mockReturnValueOnce(chainLimit([]))
            .mockReturnValueOnce(
              chainLimit([{ id: "acc-1", userId: "other-user" }]),
            ),
          insert: jest.fn(),
          update: jest.fn(),
        };
        await cb(tx);
      },
    );

    await expect(
      telegramService.linkAccount({
        token: "valid-token",
        chatId: "99999",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("vincula conta com token válido", async () => {
    const now = new Date();
    dbMock.select.mockReturnValue(
      chainLimit([
        {
          id: "tok-1",
          userId: "user-1",
          token: "valid-token",
          expiresAt: new Date(now.getTime() + 60_000),
          usedAt: null,
        },
      ]),
    );

    const insertValues = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });

    dbMock.transaction.mockImplementation(
      async (
        cb: (tx: {
          select: typeof dbMock.select;
          insert: () => { values: typeof insertValues };
          update: () => { set: typeof updateSet };
        }) => Promise<void>,
      ) => {
        const tx = {
          select: jest
            .fn()
            .mockReturnValueOnce(chainLimit([]))
            .mockReturnValueOnce(chainLimit([])),
          insert: jest.fn().mockReturnValue({ values: insertValues }),
          update: jest.fn().mockReturnValue({ set: updateSet }),
        };
        await cb(tx);
      },
    );

    await telegramService.linkAccount({
      token: "valid-token",
      chatId: "12345",
      username: "tester",
    });

    expect(insertValues).toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalled();
  });
});

describe("getAccountByChatId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna conta vinculada", async () => {
    const linkedAt = new Date("2026-01-01T12:00:00.000Z");
    dbMock.select.mockReturnValue(
      chainLimit([
        {
          userId: "user-1",
          chatId: 12345n,
          username: "tester",
          linkedAt,
        },
      ]),
    );

    const result = await telegramService.getAccountByChatId("12345");
    expect(result).toEqual({
      userId: "user-1",
      chatId: "12345",
      username: "tester",
      linkedAt: linkedAt.toISOString(),
    });
  });

  it("lança NotFoundError quando chat não está vinculado", async () => {
    dbMock.select.mockReturnValue(chainLimit([]));

    await expect(
      telegramService.getAccountByChatId("404"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getAccountByUserId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna conta vinculada ao usuário", async () => {
    const linkedAt = new Date("2026-01-01T12:00:00.000Z");
    dbMock.select.mockReturnValue(
      chainLimit([
        {
          userId: "user-1",
          chatId: 12345n,
          username: "tester",
          linkedAt,
        },
      ]),
    );

    const result = await telegramService.getAccountByUserId("user-1");
    expect(result).toEqual({
      userId: "user-1",
      chatId: "12345",
      username: "tester",
      linkedAt: linkedAt.toISOString(),
    });
  });

  it("retorna null quando usuário não possui vínculo", async () => {
    dbMock.select.mockReturnValue(chainLimit([]));

    const result = await telegramService.getAccountByUserId("user-404");
    expect(result).toBeNull();
  });
});
