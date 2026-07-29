import { getDb, investmentHoldings } from "@money-manager/db";
import type { PricingSource } from "@money-manager/types";
import { and, eq, isNull } from "drizzle-orm";
import { getCachedQuote, upsertCachedQuote } from "./quote-cache.repository.js";
import { createQuoteRouter } from "./quote-router.js";
import { pricingSourceForAssetClass } from "./types.js";
import { getDecryptedCredential } from "../../provider-credentials/provider-credentials.service.js";

export type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;
export type RefreshTrigger = "on-demand" | "background";

const ON_DEMAND_THROTTLE_MS = 60_000;
const CACHE_TTL_MARKET_HOURS_MS = 15 * 60 * 1000;
const CACHE_TTL_OFF_HOURS_MS = 60 * 60 * 1000;

function isBrazilMarketHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hour =
    Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return isWeekday && hour >= 10 && hour < 18;
}

function cacheTtlMs(now: Date): number {
  return isBrazilMarketHours(now)
    ? CACHE_TTL_MARKET_HOURS_MS
    : CACHE_TTL_OFF_HOURS_MS;
}

async function applyQuoteToHolding(
  holding: InvestmentHoldingRow,
  unitValueCents: number | null,
  pricingSource: PricingSource,
  quotedAt: Date | null,
  quoteError: string | null,
): Promise<InvestmentHoldingRow> {
  const updates: Partial<InvestmentHoldingRow> = {
    pricingSource,
    lastQuoteError: quoteError,
    updatedAt: new Date(),
  };
  if (unitValueCents !== null && quotedAt !== null) {
    updates.currentUnitValueCents = unitValueCents;
    updates.lastValuationAt = quotedAt;
  }

  await getDb()
    .update(investmentHoldings)
    .set(updates)
    .where(eq(investmentHoldings.id, holding.id));

  return { ...holding, ...updates };
}

export async function refreshHoldingQuote(
  holding: InvestmentHoldingRow,
  trigger: RefreshTrigger,
  now: Date = new Date(),
): Promise<InvestmentHoldingRow> {
  if (
    holding.incomeType !== "variable_income" ||
    holding.manualOverride ||
    holding.assetClass === null
  ) {
    return holding;
  }

  const provider = createQuoteRouter().getProvider(holding.assetClass);
  if (!provider) {
    return holding;
  }

  const pricingSource = pricingSourceForAssetClass(holding.assetClass);
  const cached = await getCachedQuote(holding.symbol, holding.assetClass);

  if (trigger === "background" && cached && cached.expiresAt > now) {
    return applyQuoteToHolding(
      holding,
      cached.unitValueCents,
      pricingSource,
      cached.quotedAt,
      null,
    );
  }

  if (
    trigger === "on-demand" &&
    cached &&
    now.getTime() - cached.quotedAt.getTime() < ON_DEMAND_THROTTLE_MS
  ) {
    return applyQuoteToHolding(
      holding,
      cached.unitValueCents,
      pricingSource,
      cached.quotedAt,
      null,
    );
  }

  try {
    // Safe: getProvider() above only returns non-null for "brapi"/"coingecko"
    // (see pricingSourceForAssetClass + ROUTABLE_ASSET_CLASSES in types.ts).
    const apiKey = await getDecryptedCredential(
      holding.userId,
      pricingSource as "brapi" | "coingecko",
    );
    const result = await provider.fetchQuote(holding.symbol, apiKey ?? undefined);
    const expiresAt = new Date(now.getTime() + cacheTtlMs(now));
    await upsertCachedQuote({
      symbol: holding.symbol,
      assetClass: holding.assetClass,
      unitValueCents: result.unitValueCents,
      pricingSource,
      quotedAt: now,
      expiresAt,
      rawResponse: result.raw,
    });
    return applyQuoteToHolding(
      holding,
      result.unitValueCents,
      pricingSource,
      now,
      null,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro desconhecido ao buscar cotação";
    console.warn(`[quote-refresh] quote failed for ${holding.symbol}`, message);
    return applyQuoteToHolding(holding, null, pricingSource, null, message);
  }
}

export async function refreshAllRvHoldingsForUser(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const rows = await getDb()
    .select()
    .from(investmentHoldings)
    .where(
      and(
        eq(investmentHoldings.userId, userId),
        eq(investmentHoldings.incomeType, "variable_income"),
        eq(investmentHoldings.manualOverride, false),
        isNull(investmentHoldings.deletedAt),
      ),
    );

  for (const row of rows) {
    await refreshHoldingQuote(row, "background", now);
  }
}
