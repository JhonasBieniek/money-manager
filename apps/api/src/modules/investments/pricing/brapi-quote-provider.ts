import { QuoteProviderError } from "./types.js";
import type { QuoteProvider, QuoteResult } from "./types.js";

const BRAPI_BASE_URL = "https://brapi.dev/api/quote";

interface BrapiQuoteResponse {
  results?: { symbol: string; regularMarketPrice: number | null }[];
}

export function normalizeB3Symbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.SA$/, "");
}

export function createBrapiQuoteProvider(
  fetchFn: typeof fetch = fetch,
): QuoteProvider {
  return {
    async fetchQuote(symbol: string): Promise<QuoteResult> {
      const token = process.env.BRAPI_TOKEN;
      if (!token) {
        throw new QuoteProviderError(
          "Brapi não configurado (BRAPI_TOKEN ausente)",
        );
      }

      const normalized = normalizeB3Symbol(symbol);
      const url = `${BRAPI_BASE_URL}/${encodeURIComponent(normalized)}?token=${encodeURIComponent(token)}`;

      let response: Response;
      try {
        response = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
      } catch {
        throw new QuoteProviderError(
          `Falha ao consultar Brapi para ${normalized}`,
        );
      }

      if (!response.ok) {
        throw new QuoteProviderError(
          `Brapi retornou status ${response.status} para ${normalized}`,
        );
      }

      let data: BrapiQuoteResponse;
      try {
        data = (await response.json()) as BrapiQuoteResponse;
      } catch {
        throw new QuoteProviderError(
          `Brapi retornou resposta inválida para ${normalized}`,
        );
      }

      const price = data.results?.[0]?.regularMarketPrice;
      if (typeof price !== "number" || !Number.isFinite(price)) {
        throw new QuoteProviderError(
          `Brapi não retornou preço válido para ${normalized}`,
        );
      }

      return { unitValueCents: Math.round(price * 100), raw: data };
    },
  };
}
