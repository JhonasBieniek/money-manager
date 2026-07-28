import { QuoteProviderError } from "./types.js";
import type { QuoteProvider, QuoteResult } from "./types.js";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3/simple/price";

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  SOL: "solana",
  BNB: "binancecoin",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
};

interface CoinGeckoResponse {
  [id: string]: { brl?: number } | undefined;
}

export function normalizeCryptoSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  const upper = trimmed.toUpperCase();
  return SYMBOL_TO_COINGECKO_ID[upper] ?? trimmed.toLowerCase();
}

export function createCoinGeckoQuoteProvider(
  fetchFn: typeof fetch = fetch,
): QuoteProvider {
  return {
    async fetchQuote(symbol: string): Promise<QuoteResult> {
      const id = normalizeCryptoSymbol(symbol);
      const url = new URL(COINGECKO_BASE_URL);
      url.searchParams.set("ids", id);
      url.searchParams.set("vs_currencies", "brl");
      const apiKey = process.env.COINGECKO_API_KEY;
      if (apiKey) {
        url.searchParams.set("x_cg_demo_api_key", apiKey);
      }

      let response: Response;
      try {
        response = await fetchFn(url.toString());
      } catch {
        throw new QuoteProviderError(`Falha ao consultar CoinGecko para ${id}`);
      }

      if (!response.ok) {
        throw new QuoteProviderError(
          `CoinGecko retornou status ${response.status} para ${id}`,
        );
      }

      let data: CoinGeckoResponse;
      try {
        data = (await response.json()) as CoinGeckoResponse;
      } catch {
        throw new QuoteProviderError(
          `CoinGecko retornou resposta inválida para ${id}`,
        );
      }

      const price = data[id]?.brl;
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new QuoteProviderError(
          `CoinGecko não retornou preço válido para ${id}`,
        );
      }

      return { unitValueCents: Math.round(price * 100), raw: data };
    },
  };
}
