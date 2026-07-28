import { getDb, investmentQuoteCache } from "@money-manager/db";
import type { AssetClass, PricingSource } from "@money-manager/types";
import { and, eq } from "drizzle-orm";

export type QuoteCacheRow = typeof investmentQuoteCache.$inferSelect;

export async function getCachedQuote(
  symbol: string,
  assetClass: AssetClass,
): Promise<QuoteCacheRow | null> {
  const [row] = await getDb()
    .select()
    .from(investmentQuoteCache)
    .where(
      and(
        eq(investmentQuoteCache.symbol, symbol),
        eq(investmentQuoteCache.assetClass, assetClass),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertCachedQuote(entry: {
  symbol: string;
  assetClass: AssetClass;
  unitValueCents: number;
  pricingSource: PricingSource;
  quotedAt: Date;
  expiresAt: Date;
  rawResponse: unknown;
}): Promise<void> {
  await getDb()
    .insert(investmentQuoteCache)
    .values(entry)
    .onConflictDoUpdate({
      target: [investmentQuoteCache.symbol, investmentQuoteCache.assetClass],
      set: {
        unitValueCents: entry.unitValueCents,
        pricingSource: entry.pricingSource,
        quotedAt: entry.quotedAt,
        expiresAt: entry.expiresAt,
        rawResponse: entry.rawResponse,
      },
    });
}
