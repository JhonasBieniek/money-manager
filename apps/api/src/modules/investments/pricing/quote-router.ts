import type { AssetClass } from "@money-manager/types";
import { createBrapiQuoteProvider } from "./brapi-quote-provider.js";
import { createCoinGeckoQuoteProvider } from "./coingecko-quote-provider.js";
import { pricingSourceForAssetClass } from "./types.js";
import type { QuoteProvider } from "./types.js";

export interface QuoteRouter {
  getProvider(assetClass: AssetClass): QuoteProvider | null;
}

export function createQuoteRouter(
  fetchFn: typeof fetch = fetch,
): QuoteRouter {
  const brapi = createBrapiQuoteProvider(fetchFn);
  const coingecko = createCoinGeckoQuoteProvider(fetchFn);

  return {
    getProvider(assetClass: AssetClass): QuoteProvider | null {
      const source = pricingSourceForAssetClass(assetClass);
      if (source === "brapi") return brapi;
      if (source === "coingecko") return coingecko;
      return null;
    },
  };
}
