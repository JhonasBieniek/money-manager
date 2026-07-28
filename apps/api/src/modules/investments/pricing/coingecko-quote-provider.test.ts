import { describe, expect, it, jest, afterEach } from "@jest/globals";
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
  const originalKey = process.env.COINGECKO_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.COINGECKO_API_KEY;
    } else {
      process.env.COINGECKO_API_KEY = originalKey;
    }
  });

  it("funciona sem COINGECKO_API_KEY configurada (tier público)", async () => {
    delete process.env.COINGECKO_API_KEY;
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

  it("inclui x_cg_demo_api_key quando COINGECKO_API_KEY está configurada", async () => {
    process.env.COINGECKO_API_KEY = "demo-key";
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ethereum: { brl: 12000 } }),
    });
    const provider = createCoinGeckoQuoteProvider(
      fetchFn as unknown as typeof fetch,
    );

    await provider.fetchQuote("ETH");

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
});
