import {
  getDb,
  investmentAccounts,
  investmentHoldings,
  piggyBanks,
} from "@money-manager/db";
import type {
  PatrimonyAccountBucket,
  PatrimonySummary,
  PatrimonyUpcomingMaturity,
} from "@money-manager/types";
import { and, eq, isNull } from "drizzle-orm";

type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;
type InvestmentAccountRow = typeof investmentAccounts.$inferSelect;
type PiggyBankRow = typeof piggyBanks.$inferSelect;

const UPCOMING_MATURITY_WINDOW_DAYS = 90;

export function computePatrimonySummary(
  holdings: InvestmentHoldingRow[],
  accounts: InvestmentAccountRow[],
  piggyBankRows: PiggyBankRow[],
  now: Date,
): PatrimonySummary {
  const investmentsCents = holdings.reduce(
    (acc, holding) => acc + holding.currentUnitValueCents,
    0,
  );
  const piggyBanksCents = piggyBankRows.reduce(
    (acc, piggyBank) => acc + piggyBank.currentAmountCents,
    0,
  );
  const totalAssetsCents = investmentsCents + piggyBanksCents;

  const byAssetClass =
    investmentsCents > 0
      ? [
          {
            class: "fixed_income_group" as const,
            label: "Renda fixa",
            totalCents: investmentsCents,
            percentage: 100,
          },
        ]
      : [];

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const totalsByAccount = new Map<string, number>();
  for (const holding of holdings) {
    totalsByAccount.set(
      holding.accountId,
      (totalsByAccount.get(holding.accountId) ?? 0) +
        holding.currentUnitValueCents,
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
  const todayStr = now.toISOString().slice(0, 10);
  const cutoffStr = maturityCutoff.toISOString().slice(0, 10);

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
      totalCents: holding.currentUnitValueCents,
    }))
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  return {
    totalAssetsCents,
    investmentsCents,
    piggyBanksCents,
    byAssetClass,
    byAccount,
    lastUpdatedAt: lastUpdatedAt ? lastUpdatedAt.toISOString() : null,
    quotesStale: false,
    upcomingMaturities,
  };
}

export async function getPatrimonySummary(
  userId: string,
): Promise<PatrimonySummary> {
  const db = getDb();
  const [holdings, accounts, piggyBankRows] = await Promise.all([
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
      .where(and(eq(piggyBanks.userId, userId), isNull(piggyBanks.deletedAt))),
  ]);

  return computePatrimonySummary(holdings, accounts, piggyBankRows, new Date());
}
