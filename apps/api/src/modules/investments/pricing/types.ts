import type { AssetClass, PricingSource } from "@money-manager/types";

export interface QuoteResult {
  unitValueCents: number;
  raw: unknown;
}

export class QuoteProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteProviderError";
  }
}

export interface QuoteProvider {
  fetchQuote(symbol: string): Promise<QuoteResult>;
}

const ROUTABLE_ASSET_CLASSES: Partial<Record<AssetClass, PricingSource>> = {
  stocks: "brapi",
  fii: "brapi",
  fund: "brapi",
  crypto: "coingecko",
};

export function pricingSourceForAssetClass(
  assetClass: AssetClass,
): PricingSource {
  return ROUTABLE_ASSET_CLASSES[assetClass] ?? "manual";
}
