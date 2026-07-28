import { describe, expect, it, jest } from "@jest/globals";
import { createQuoteRouter } from "./quote-router.js";

describe("createQuoteRouter", () => {
  it("roteia stocks, fii e fund para o provider Brapi", () => {
    const router = createQuoteRouter(jest.fn() as unknown as typeof fetch);
    const stocksProvider = router.getProvider("stocks");
    expect(stocksProvider).toBe(router.getProvider("fii"));
    expect(stocksProvider).toBe(router.getProvider("fund"));
    expect(stocksProvider).not.toBeNull();
  });

  it("roteia crypto para o provider CoinGecko, distinto do Brapi", () => {
    const router = createQuoteRouter(jest.fn() as unknown as typeof fetch);
    const stocksProvider = router.getProvider("stocks");
    const cryptoProvider = router.getProvider("crypto");
    expect(cryptoProvider).not.toBeNull();
    expect(cryptoProvider).not.toBe(stocksProvider);
  });

  it("retorna null para classes sem provider automático", () => {
    const router = createQuoteRouter(jest.fn() as unknown as typeof fetch);
    expect(router.getProvider("real_estate")).toBeNull();
    expect(router.getProvider("cash")).toBeNull();
    expect(router.getProvider("other")).toBeNull();
    expect(router.getProvider("fixed_income")).toBeNull();
  });
});
