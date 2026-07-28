import {
  getDb,
  investmentAccounts,
  investmentHoldings,
  investmentQuoteCache,
  piggyBanks,
} from "@money-manager/db";
import { ASSET_CLASS_LABELS } from "@money-manager/types";
import type {
  PatrimonyAccountBucket,
  PatrimonyAssetClassBucket,
  PatrimonySummary,
  PatrimonyUpcomingMaturity,
} from "@money-manager/types";
import { toDateString } from "@money-manager/utils/installment-schedule";
import { and, eq, isNull } from "drizzle-orm";

type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;
type InvestmentAccountRow = typeof investmentAccounts.$inferSelect;
type PiggyBankRow = typeof piggyBanks.$inferSelect;
type QuoteCacheRow = typeof investmentQuoteCache.$inferSelect;

const UPCOMING_MATURITY_WINDOW_DAYS = 90;

function holdingValueCents(holding: InvestmentHoldingRow): number {
  return Math.round(Number(holding.quantity) * holding.currentUnitValueCents);
}

function isHoldingQuoteStale(
  holding: InvestmentHoldingRow,
  cacheBySymbolClass: Map<string, QuoteCacheRow>,
  now: Date,
): boolean {
  if (
    holding.incomeType !== "variable_income" ||
    holding.manualOverride ||
    holding.pricingSource === "manual"
  ) {
    return false;
  }
  const cached = cacheBySymbolClass.get(
    `${holding.symbol}:${holding.assetClass}`,
  );
  if (!cached) return true;
  return cached.expiresAt < now;
}

export function computePatrimonySummary(
  holdings: InvestmentHoldingRow[],
  accounts: InvestmentAccountRow[],
  piggyBankRows: PiggyBankRow[],
  quoteCacheRows: QuoteCacheRow[],
  now: Date,
): PatrimonySummary {
  const investmentsCents = holdings.reduce(
    (acc, holding) => acc + holdingValueCents(holding),
    0,
  );
  const piggyBanksCents = piggyBankRows.reduce(
    (acc, piggyBank) => acc + piggyBank.currentAmountCents,
    0,
  );
  const totalAssetsCents = investmentsCents + piggyBanksCents;

  const totalsByClassKey = new Map<string, number>();
  for (const holding of holdings) {
    const key =
      holding.incomeType === "fixed_income"
        ? "fixed_income_group"
        : (holding.assetClass ?? "other");
    totalsByClassKey.set(
      key,
      (totalsByClassKey.get(key) ?? 0) + holdingValueCents(holding),
    );
  }
  const byAssetClass: PatrimonyAssetClassBucket[] = Array.from(
    totalsByClassKey.entries(),
  ).map(([key, totalCents]) => ({
    class: key as PatrimonyAssetClassBucket["class"],
    label:
      key === "fixed_income_group"
        ? "Renda fixa"
        : (ASSET_CLASS_LABELS[key as keyof typeof ASSET_CLASS_LABELS] ?? key),
    totalCents,
    percentage:
      investmentsCents > 0
        ? Math.round((totalCents / investmentsCents) * 1000) / 10
        : 0,
  }));

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const totalsByAccount = new Map<string, number>();
  for (const holding of holdings) {
    totalsByAccount.set(
      holding.accountId,
      (totalsByAccount.get(holding.accountId) ?? 0) +
        holdingValueCents(holding),
    );
  }
  const byAccount: PatrimonyAccountBucket[] = Array.from(
    totalsByAccount.entries(),
  ).map(([accountId, totalCents]) => ({
    accountId,
    name: accountNameById.get(accountId) ?? "Conta removida",
    totalCents,
  }));

  const lastUpdatedAt = holdings.reduce<Date | null>((latest, holding) => {
    if (!latest || holding.lastValuationAt > latest) {
      return holding.lastValuationAt;
    }
    return latest;
  }, null);

  const maturityCutoff = new Date(now);
  maturityCutoff.setDate(
    maturityCutoff.getDate() + UPCOMING_MATURITY_WINDOW_DAYS,
  );
  const todayStr = toDateString(now);
  const cutoffStr = toDateString(maturityCutoff);

  const upcomingMaturities: PatrimonyUpcomingMaturity[] = holdings
    .filter(
      (holding) =>
        holding.maturityDate !== null &&
        holding.maturityDate >= todayStr &&
        holding.maturityDate <= cutoffStr,
    )
    .map((holding) => ({
      holdingId: holding.id,
      name: holding.symbol,
      maturityDate: holding.maturityDate as string,
      totalCents: holdingValueCents(holding),
    }))
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  const cacheBySymbolClass = new Map(
    quoteCacheRows.map((row) => [`${row.symbol}:${row.assetClass}`, row]),
  );
  const quotesStale = holdings.some((holding) =>
    isHoldingQuoteStale(holding, cacheBySymbolClass, now),
  );

  return {
    totalAssetsCents,
    investmentsCents,
    piggyBanksCents,
    byAssetClass,
    byAccount,
    lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
    quotesStale,
    upcomingMaturities,
  };
}

export async function getPatrimonySummary(
  userId: string,
): Promise<PatrimonySummary> {
  const db = getDb();
  const [holdings, accounts, piggyBankRows, quoteCacheRows] = await Promise.all(
    [
      db
        .select()
        .from(investmentHoldings)
        .where(
          and(
            eq(investmentHoldings.userId, userId),
            isNull(investmentHoldings.deletedAt),
          ),
        ),
      db
        .select()
        .from(investmentAccounts)
        .where(
          and(
            eq(investmentAccounts.userId, userId),
            isNull(investmentAccounts.deletedAt),
          ),
        ),
      db
        .select()
        .from(piggyBanks)
        .where(
          and(eq(piggyBanks.userId, userId), isNull(piggyBanks.deletedAt)),
        ),
      db.select().from(investmentQuoteCache),
    ],
  );

  return computePatrimonySummary(
    holdings,
    accounts,
    piggyBankRows,
    quoteCacheRows,
    new Date(),
  );
}
