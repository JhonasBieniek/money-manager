import { describe, expect, it, jest } from "@jest/globals";
import {
  createCoinGeckoQuoteProvider,
  normalizeCryptoSymbol,
} from "./coingecko-quote-provider.js";
import { QuoteProviderError } from "./types.js";

describe("normalizeCryptoSymbol", () => {
  it("mapeia símbolos comuns para o id do CoinGecko", () => {
    expect(normalizeCryptoSymbol("btc")).toBe("bitcoin");
    expect(normalizeCryptoSymbol("ETH")).toBe("ethereum");
  });

  it("usa o texto em minúsculas quando não há mapeamento", () => {
    expect(normalizeCryptoSymbol("Cardano2")).toBe("cardano2");
  });
});

describe("createCoinGeckoQuoteProvider", () => {
  it("funciona sem apiKey (tier público)", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bitcoin: { brl: 350000.5 } }),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    const result = await provider.fetchQuote("BTC");

    expect(result.unitValueCents).toBe(35000050);
    const calledUrl = (fetchFn.mock.calls[0]?.[0] as string) ?? "";
    expect(calledUrl).not.toContain("x_cg_demo_api_key");
  });

  it("inclui x_cg_demo_api_key quando apiKey é passada", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ethereum: { brl: 12000 } }),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await provider.fetchQuote("ETH", "demo-key");

    const calledUrl = (fetchFn.mock.calls[0]?.[0] as string) ?? "";
    expect(calledUrl).toContain("x_cg_demo_api_key=demo-key");
  });

  it("lança QuoteProviderError quando a resposta não tem preço válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });

  it("lança QuoteProviderError quando a API retorna status de erro", async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });

  it("lança QuoteProviderError quando fetchFn rejeita (erro de rede)", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error("network down"));
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });

  it("lança QuoteProviderError quando a resposta não é JSON válido", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await expect(provider.fetchQuote("BTC")).rejects.toThrow(
      QuoteProviderError,
    );
  });
});
