import {
  getDb,
  investmentAccounts,
  investmentHoldings,
  investmentQuoteCache,
  investmentSnapshots,
  piggyBanks,
} from "@money-manager/db";
import { ASSET_CLASS_LABELS } from "@money-manager/types";
import type {
  PatrimonyAccountBucket,
  PatrimonyAssetClassBucket,
  PatrimonyHistoryPoint,
  PatrimonySnapshot,
  PatrimonySummary,
  PatrimonyUpcomingMaturity,
} from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { toDateString } from "@money-manager/utils/installment-schedule";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { todayBrtString } from "./brt-date.js";

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

type InvestmentSnapshotRow = typeof investmentSnapshots.$inferSelect;

function toPatrimonySnapshot(row: InvestmentSnapshotRow): PatrimonySnapshot {
  return {
    id: row.id,
    userId: row.userId,
    snapshotDate: row.snapshotDate,
    totalAssetsCents: row.totalAssetsCents,
    byAssetClass: row.byAssetClass as PatrimonyAssetClassBucket[],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerSnapshot(
  userId: string,
  now: Date,
): Promise<PatrimonySnapshot> {
  const summary = await getPatrimonySummary(userId);
  const snapshotDate = todayBrtString(now);
  const db = getDb();

  const [row] = await db
    .insert(investmentSnapshots)
    .values({
      id: newId(),
      userId,
      snapshotDate,
      totalAssetsCents: summary.totalAssetsCents,
      byAssetClass: summary.byAssetClass,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [investmentSnapshots.userId, investmentSnapshots.snapshotDate],
      set: {
        totalAssetsCents: summary.totalAssetsCents,
        byAssetClass: summary.byAssetClass,
      },
    })
    .returning();

  return toPatrimonySnapshot(row);
}

export function subtractMonthsClamped(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const targetMonthIndex = month - months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(date.getDate(), daysInTargetMonth);

  const result = new Date(date);
  result.setFullYear(targetYear, targetMonth, clampedDay);
  return result;
}

export async function getPatrimonyHistory(
  userId: string,
  months: number,
): Promise<PatrimonyHistoryPoint[]> {
  const cutoff = subtractMonthsClamped(new Date(), months);
  const cutoffStr = toDateString(cutoff);

  const rows = await getDb()
    .select({
      snapshotDate: investmentSnapshots.snapshotDate,
      totalAssetsCents: investmentSnapshots.totalAssetsCents,
    })
    .from(investmentSnapshots)
    .where(
      and(
        eq(investmentSnapshots.userId, userId),
        gte(investmentSnapshots.snapshotDate, cutoffStr),
      ),
    )
    .orderBy(asc(investmentSnapshots.snapshotDate));

  return rows;
}
