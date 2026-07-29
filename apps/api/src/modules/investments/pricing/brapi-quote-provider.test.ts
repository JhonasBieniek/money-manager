import { describe, expect, it, jest } from "@jest/globals";
import {
  createBrapiQuoteProvider,
  normalizeB3Symbol,
} from "./brapi-quote-provider.js";
import { QuoteProviderError } from "./types.js";

describe("normalizeB3Symbol", () => {
  it("uppercases e remove sufixo .SA", () => {
    expect(normalizeB3Symbol("petr4.sa")).toBe("PETR4");
    expect(normalizeB3Symbol(" HGLG11 ")).toBe("HGLG11");
  });
});

describe("createBrapiQuoteProvider", () => {
  it("lança QuoteProviderError quando nenhuma apiKey é passada", async () => {
    const fetchFn = jest.fn();
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(provider.fetchQuote("PETR4")).rejects.toThrow(
      QuoteProviderError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("retorna a cotação em centavos a partir de regularMarketPrice", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ symbol: "PETR4", regularMarketPrice: 38.42 }],
      }),
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    const result = await provider.fetchQuote("petr4.sa", "test-token");

    expect(result.unitValueCents).toBe(3842);
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("https://brapi.dev/api/quote/PETR4"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("lança QuoteProviderError quando a API retorna status de erro", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404 });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("INVALIDO", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });

  it("lança QuoteProviderError quando a resposta não tem preço válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("PETR4", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });

  it("lança QuoteProviderError quando fetchFn rejeita (erro de rede)", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error("network down"));
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("PETR4", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });

  it("lança QuoteProviderError quando a resposta não é JSON válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const provider = createBrapiQuoteProvider(fetchFn as unknown as typeof fetch);

    await expect(
      provider.fetchQuote("PETR4", "test-token"),
    ).rejects.toThrow(QuoteProviderError);
  });
});
