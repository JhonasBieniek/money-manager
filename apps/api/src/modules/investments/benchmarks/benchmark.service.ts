import { benchmarkRates, getDb, investmentSnapshots } from "@money-manager/db";
import type {
  BenchmarkComparison,
  BenchmarkComparisonPoint,
  BenchmarkType,
} from "@money-manager/types";
import { toDateString } from "@money-manager/utils/installment-schedule";
import { and, asc, eq, gte } from "drizzle-orm";
import { createBcbProvider } from "./bcb-provider.js";
import type { BcbSeriesPoint } from "./bcb-provider.js";

export const IPCA_SERIES_CODE = 433;
export const CDI_SERIES_CODE = 4389;
const FETCH_POINTS = 14 * 22; // ~14 months of margin; CDI is daily, IPCA is monthly

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function latestPerMonth(
  points: BcbSeriesPoint[],
): Map<string, BcbSeriesPoint> {
  const byMonth = new Map<string, BcbSeriesPoint>();
  for (const point of points) {
    const key = monthKey(point.date);
    const existing = byMonth.get(key);
    if (!existing || point.date > existing.date) {
      byMonth.set(key, point);
    }
  }
  return byMonth;
}

export function annualToMonthlyPct(annualPct: number): number {
  return (Math.pow(1 + annualPct / 100, 1 / 12) - 1) * 100;
}

export function compoundAccumulatedPct(monthlyRates: number[]): number {
  const factor = monthlyRates.reduce((acc, rate) => acc * (1 + rate / 100), 1);
  return Math.round((factor - 1) * 10000) / 100;
}

async function refreshOneBenchmark(
  benchmark: BenchmarkType,
  seriesCode: number,
  convert: (rawValue: number) => number,
  now: Date,
): Promise<void> {
  const provider = createBcbProvider();
  const points = await provider.fetchSeries(seriesCode, FETCH_POINTS);
  const monthly = latestPerMonth(points);

  const db = getDb();
  for (const [key, point] of monthly) {
    const referenceMonth = `${key}-01`;
    const monthlyRatePct = convert(point.value).toFixed(4);

    await db
      .insert(benchmarkRates)
      .values({ benchmark, referenceMonth, monthlyRatePct, fetchedAt: now })
      .onConflictDoUpdate({
        target: [benchmarkRates.benchmark, benchmarkRates.referenceMonth],
        set: { monthlyRatePct, fetchedAt: now },
      });
  }
}

export async function refreshBenchmarks(now: Date): Promise<void> {
  try {
    await refreshOneBenchmark("ipca", IPCA_SERIES_CODE, (v) => v, now);
  } catch (err) {
    console.error("[benchmark.service] IPCA refresh failed", err);
  }

  try {
    await refreshOneBenchmark("cdi", CDI_SERIES_CODE, annualToMonthlyPct, now);
  } catch (err) {
    console.error("[benchmark.service] CDI refresh failed", err);
  }
}

export async function getBenchmarkComparison(
  userId: string,
  period: "year" | "12m",
): Promise<BenchmarkComparison> {
  const now = new Date();
  const startMonth =
    period === "year"
      ? `${now.getFullYear()}-01-01`
      : toDateString(new Date(now.getFullYear(), now.getMonth() - 11, 1));

  const db = getDb();
  const [snapshots, rateRows] = await Promise.all([
    db
      .select({
        snapshotDate: investmentSnapshots.snapshotDate,
        totalAssetsCents: investmentSnapshots.totalAssetsCents,
      })
      .from(investmentSnapshots)
      .where(
        and(
          eq(investmentSnapshots.userId, userId),
          gte(investmentSnapshots.snapshotDate, startMonth),
        ),
      )
      .orderBy(asc(investmentSnapshots.snapshotDate)),
    db
      .select()
      .from(benchmarkRates)
      .where(gte(benchmarkRates.referenceMonth, startMonth))
      .orderBy(asc(benchmarkRates.referenceMonth)),
  ]);

  const ratesByBenchmark: Record<BenchmarkType, Map<string, number>> = {
    ipca: new Map(),
    cdi: new Map(),
  };
  for (const row of rateRows) {
    ratesByBenchmark[row.benchmark].set(
      row.referenceMonth,
      Number(row.monthlyRatePct),
    );
  }

  const months = Array.from(
    new Set([...ratesByBenchmark.ipca.keys(), ...ratesByBenchmark.cdi.keys()]),
  ).sort();

  const startCents = snapshots[0]?.totalAssetsCents ?? null;

  const ipcaRatesSoFar: number[] = [];
  const cdiRatesSoFar: number[] = [];
  const series: BenchmarkComparisonPoint[] = months.map((month) => {
    const ipcaRate = ratesByBenchmark.ipca.get(month);
    const cdiRate = ratesByBenchmark.cdi.get(month);
    if (ipcaRate !== undefined) ipcaRatesSoFar.push(ipcaRate);
    if (cdiRate !== undefined) cdiRatesSoFar.push(cdiRate);

    const snapshotForMonth = snapshots.find((s) =>
      s.snapshotDate.startsWith(month),
    );
    const patrimonyIndexed =
      startCents && snapshotForMonth
        ? Math.round((snapshotForMonth.totalAssetsCents / startCents) * 10000) /
          100
        : 100;

    return {
      referenceMonth: month,
      patrimonyIndexed,
      ipcaAccumulatedPct:
        ipcaRate !== undefined ? compoundAccumulatedPct(ipcaRatesSoFar) : null,
      cdiAccumulatedPct:
        cdiRate !== undefined ? compoundAccumulatedPct(cdiRatesSoFar) : null,
    };
  });

  const lastSnapshot = snapshots[snapshots.length - 1] ?? null;
  const portfolioReturnPct =
    startCents && lastSnapshot && snapshots.length >= 2
      ? Math.round(
          ((lastSnapshot.totalAssetsCents - startCents) / startCents) * 10000,
        ) / 100
      : null;
  const cdiReturnPct =
    cdiRatesSoFar.length > 0 ? compoundAccumulatedPct(cdiRatesSoFar) : null;

  return { series, portfolioReturnPct, cdiReturnPct };
}
