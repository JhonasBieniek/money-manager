import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  InvalidCredentialsError,
  UnauthorizedError,
} from "../../shared/errors/app-error.js";
import * as authService from "./auth.service.js";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@money-manager/db", () => ({
  db: dbMock,
  users: {},
  sessions: {},
  telegramLinkTokens: {},
}));

vi.mock("bcrypt", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("$2b$12$mockhashmockhashmockhashmockhashmocker"),
  },
}));

vi.mock("../../lib/jwt.js", () => ({
  signAccessToken: vi.fn().mockResolvedValue("jwt.access"),
}));

describe("loginUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.transaction.mockImplementation(
      async (
        cb: (tx: {
          insert: () => { values: () => Promise<void> };
        }) => Promise<void>
      ) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        await cb(tx);
      }
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
    vi.mocked(bcrypt.compare).mockResolvedValue(false);

    await expect(
      authService.loginUser({ email: "a@b.co", password: "any" }, {})
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("lança InvalidCredentialsError quando a senha está errada", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { id: "550e8400-e29b-41d4-a716-446655440000", passwordHash: "$2b$12$x" },
            ]),
        }),
      }),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(false);

    await expect(
      authService.loginUser({ email: "a@b.co", password: "wrong" }, {})
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("em sucesso retorna body sem segredos e refresh opaco", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { id: "550e8400-e29b-41d4-a716-446655440000", passwordHash: "$2b$12$x" },
            ]),
        }),
      }),
    });
    vi.mocked(bcrypt.compare).mockResolvedValue(true);

    const result = await authService.loginUser(
      { email: "a@b.co", password: "ok" },
      {}
    );

    expect(result.body).toEqual({
      accessToken: "jwt.access",
      tokenType: "Bearer",
      expiresInSeconds: 900,
    });
    expect(typeof result.refreshTokenPlain).toBe("string");
    expect(result.refreshTokenPlain.length).toBeGreaterThan(20);
    expect(result.body).not.toHaveProperty("passwordHash" as keyof typeof result.body);
  });
});

describe("refreshSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lança UnauthorizedError sem cookie", async () => {
    await expect(authService.refreshSession(undefined, {})).rejects.toThrow(UnauthorizedError);
  });

  it("lança UnauthorizedError quando não há sessão", async () => {
    dbMock.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
        update: vi.fn(),
        insert: vi.fn(),
      };
      return cb(tx);
    });

    await expect(
      authService.refreshSession("some-token", {})
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("registerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bcrypt.hash).mockResolvedValue(
      "$2b$12$mockhashmockhashmockhashmockhashmocker"
    );
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
        }) => Promise<void>
      ) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                for: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(existingRow ? [existingRow] : []),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        await cb(tx);
      }
    );
  }

  it("retorna texto Telegram e TTL 15 min após criar usuário", async () => {
    mockRegisterTx(null);

    const result = await authService.registerUser({
      email: "new@example.com",
      password: "12345678",
    });

    expect(result.telegramStartText).toMatch(/^\/start [a-f0-9]{64}$/);
    expect(result.telegramExplanation.length).toBeGreaterThan(10);
    expect(result.expiresInSeconds).toBe(900);
    expect(result).not.toHaveProperty("password");
  });

  it("lança ConflictError se email já está em uso", async () => {
    mockRegisterTx({ id: "550e8400-e29b-41d4-a716-446655440000" });

    await expect(
      authService.registerUser({ email: "taken@example.com", password: "12345678" })
    ).rejects.toThrow(ConflictError);
  });
});
