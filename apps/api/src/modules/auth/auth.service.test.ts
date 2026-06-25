import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  ConflictError,
  InvalidCredentialsError,
  UnauthorizedError,
} from "../../shared/errors/app-error.js";

const dbMock = {
  select: jest.fn(),
  transaction: jest.fn(),
};

const verifyPassword = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  users: {},
  sessions: {},
}));

jest.unstable_mockModule("@money-manager/utils", () => ({
  BCRYPT_DUMMY_HASH: "$2b$12$dummy",
  generateRefreshTokenPlain: () => "refresh-plain-token-value-32bytes!!",
  hashPassword: jest.fn(async () => "$2b$12$mockhash"),
  hashRefreshToken: (plain: string) => `hash:${plain}`,
  newId: () => "550e8400-e29b-41d4-a716-446655440000",
  verifyPassword,
}));

jest.unstable_mockModule("../../lib/jwt.js", () => ({
  signAccessToken: jest.fn(async () => "jwt.access"),
  ACCESS_TOKEN_TTL_SEC: 900,
}));

const authService = await import("./auth.service.js");

describe("loginUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dbMock.transaction.mockImplementation(
      async (
        cb: (tx: {
          insert: () => { values: () => Promise<void> };
        }) => Promise<void>,
      ) => {
        const tx = {
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockResolvedValue(undefined),
          }),
        };
        await cb(tx);
      },
    );
  });

  it("lança InvalidCredentialsError quando o usuário não existe", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });
    verifyPassword.mockResolvedValue(false);

    await expect(
      authService.loginUser({ email: "a@b.co", password: "any" }, {}),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("lança InvalidCredentialsError quando a senha está errada", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "550e8400-e29b-41d4-a716-446655440000",
                passwordHash: "$2b$12$x",
              },
            ]),
        }),
      }),
    });
    verifyPassword.mockResolvedValue(false);

    await expect(
      authService.loginUser({ email: "a@b.co", password: "wrong" }, {}),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("em sucesso retorna body sem segredos e refresh opaco", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "550e8400-e29b-41d4-a716-446655440000",
                passwordHash: "$2b$12$x",
              },
            ]),
        }),
      }),
    });
    verifyPassword.mockResolvedValue(true);

    const result = await authService.loginUser(
      { email: "a@b.co", password: "ok" },
      {},
    );

    expect(result.body).toEqual({
      accessToken: "jwt.access",
      tokenType: "Bearer",
      expiresInSeconds: 900,
    });
    expect(result.refreshTokenPlain.length).toBeGreaterThan(20);
  });
});

describe("refreshSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lança UnauthorizedError sem cookie", async () => {
    await expect(authService.refreshSession(undefined, {})).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("lança UnauthorizedError quando não há sessão", async () => {
    dbMock.transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                for: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
          update: jest.fn(),
          insert: jest.fn(),
        };
        return cb(tx);
      },
    );

    await expect(
      authService.refreshSession("some-token", {}),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("registerUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockRegisterTx(existingRow: { id: string } | null) {
    dbMock.transaction.mockImplementation(
      async (
        cb: (tx: {
          select: () => {
            from: () => {
              where: () => {
                for: () => { limit: () => Promise<unknown> };
              };
            };
          };
          insert: () => { values: () => Promise<void> };
        }) => Promise<void>,
      ) => {
        const tx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                for: jest.fn().mockReturnValue({
                  limit: jest
                    .fn()
                    .mockResolvedValue(existingRow ? [existingRow] : []),
                }),
              }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockResolvedValue(undefined),
          }),
        };
        await cb(tx);
      },
    );
  }

  it("retorna mensagem e sessão após criar usuário", async () => {
    mockRegisterTx(null);

    const result = await authService.registerUser(
      {
        email: "new@example.com",
        password: "12345678",
      },
      { userAgent: "jest", ip: "127.0.0.1" },
    );

    expect(result.body.message).toBe("Conta criada com sucesso");
    expect(result.body.accessToken).toBe("jwt.access");
    expect(result.refreshTokenPlain).toBe("refresh-plain-token-value-32bytes!!");
  });

  it("lança ConflictError se email já está em uso", async () => {
    mockRegisterTx({ id: "550e8400-e29b-41d4-a716-446655440000" });

    await expect(
      authService.registerUser(
        {
          email: "taken@example.com",
          password: "12345678",
        },
        {},
      ),
    ).rejects.toThrow(ConflictError);
  });
});
