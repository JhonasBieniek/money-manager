import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QuoteProviderError } from "../investments/pricing/types.js";

const dbMock = {
  select: jest.fn(),
  insert: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
  transaction: jest.fn(),
};

jest.unstable_mockModule("@money-manager/db", () => ({
  getDb: () => dbMock,
  userProviderCredentials: {
    userId: "user_id",
    provider: "provider",
    encryptedValue: "encrypted_value",
    iv: "iv",
    authTag: "auth_tag",
    updatedAt: "updated_at",
  },
}));

const mockFetchQuote = jest.fn();
jest.unstable_mockModule("../investments/pricing/brapi-quote-provider.js", () => ({
  createBrapiQuoteProvider: () => ({ fetchQuote: mockFetchQuote }),
}));
jest.unstable_mockModule("../investments/pricing/coingecko-quote-provider.js", () => ({
  createCoinGeckoQuoteProvider: () => ({ fetchQuote: mockFetchQuote }),
}));

const { setCredential, getDecryptedCredential } = await import(
  "./provider-credentials.service.js"
);

const originalEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
});

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
  } else {
    process.env.SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
  }
});

describe("setCredential", () => {
  it("valida a chave contra o provider antes de salvar", async () => {
    mockFetchQuote.mockResolvedValueOnce({ unitValueCents: 3800, raw: {} });
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({
      values: jest.fn().mockReturnValue({ onConflictDoUpdate }),
    });

    await setCredential("user-1", "brapi", "chave-valida");

    expect(mockFetchQuote).toHaveBeenCalledWith("PETR4", "chave-valida");
    expect(dbMock.insert).toHaveBeenCalled();
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });

  it("propaga o erro e não salva quando a validação falha", async () => {
    mockFetchQuote.mockRejectedValueOnce(
      new QuoteProviderError("chave inválida"),
    );

    await expect(
      setCredential("user-1", "brapi", "chave-invalida"),
    ).rejects.toThrow(QuoteProviderError);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});

describe("getDecryptedCredential", () => {
  it("retorna null quando não há credencial cadastrada", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    const result = await getDecryptedCredential("user-1", "coingecko");

    expect(result).toBeNull();
  });

  it("retorna null (sem lançar) quando a linha armazenada não descriptografa", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                encryptedValue: "aW52YWxpZG8=",
                iv: Buffer.alloc(12, 2).toString("base64"),
                authTag: Buffer.alloc(16, 3).toString("base64"),
              },
            ]),
        }),
      }),
    });

    const result = await getDecryptedCredential("user-1", "brapi");

    expect(result).toBeNull();
  });
});
