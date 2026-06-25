import { expenses, getDb, incomes } from "@money-manager/db";
import type {
  DashboardHistoryMonth,
  DashboardSummary,
} from "@money-manager/types";
import { GOAL_CATEGORY_LABELS } from "@money-manager/types";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import * as goalsService from "../goals/goals.service.js";

function monthYearRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

function buildMonthSlots(
  months: number,
): Array<{ year: number; monthNum: number; month: string }> {
  const now = new Date();
  const slots: Array<{ year: number; monthNum: number; month: string }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const monthNum = date.getMonth() + 1;
    slots.push({
      year,
      monthNum,
      month: `${year}-${String(monthNum).padStart(2, "0")}`,
    });
  }

  return slots;
}

export async function getDashboardSummary(
  userId: string,
  year: number,
  month: number,
): Promise<DashboardSummary> {
  const db = getDb();
  const { start, end } = monthYearRange(year, month);

  const [incomesResult, expensesResult, categoryRows, goalsUsageRows] =
    await Promise.all([
      db
        .select({
          total: sql<number>`COALESCE(SUM(${incomes.amountCents}), 0)::int`,
        })
        .from(incomes)
        .where(
          and(
            eq(incomes.userId, userId),
            isNull(incomes.deletedAt),
            gte(incomes.occurredAt, start),
            lte(incomes.occurredAt, end),
          ),
        ),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            isNull(expenses.deletedAt),
            gte(expenses.occurredAt, start),
            lte(expenses.occurredAt, end),
          ),
        ),
      db
        .select({
          category: expenses.goalCategory,
          total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            isNull(expenses.deletedAt),
            gte(expenses.occurredAt, start),
            lte(expenses.occurredAt, end),
          ),
        )
        .groupBy(expenses.goalCategory),
      goalsService.getGoalUsage(userId, year, month),
    ]);

  const totalIncomes = incomesResult[0]?.total ?? 0;
  const totalExpenses = expensesResult[0]?.total ?? 0;

  const expensesByCategory = categoryRows
    .filter((row) => (row.total ?? 0) > 0)
    .map((row) => ({
      category: GOAL_CATEGORY_LABELS[row.category] ?? row.category,
      amount: row.total ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const goalsUsage = goalsUsageRows.map((goal) => ({
    category: goal.category,
    percentage: goal.percentageValue,
    ceiling: goal.ceiling,
    spent: goal.spent,
    usagePercent: goal.usagePercent,
  }));

  return {
    totalIncomes,
    totalExpenses,
    balance: totalIncomes - totalExpenses,
    expensesByCategory,
    goalsUsage,
  };
}

export async function getDashboardHistory(
  userId: string,
  months: number,
): Promise<DashboardHistoryMonth[]> {
  const db = getDb();
  const slots = buildMonthSlots(months);
  const first = slots[0];
  const last = slots[slots.length - 1];

  if (!first || !last) {
    return [];
  }

  const { start } = monthYearRange(first.year, first.monthNum);
  const { end } = monthYearRange(last.year, last.monthNum);

  const monthKey = (year: number, monthNum: number) => `${year}-${monthNum}`;

  const [incomeRows, expenseRows] = await Promise.all([
    db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM ${incomes.occurredAt})::int`,
        monthNum: sql<number>`EXTRACT(MONTH FROM ${incomes.occurredAt})::int`,
        total: sql<number>`COALESCE(SUM(${incomes.amountCents}), 0)::int`,
      })
      .from(incomes)
      .where(
        and(
          eq(incomes.userId, userId),
          isNull(incomes.deletedAt),
          gte(incomes.occurredAt, start),
          lte(incomes.occurredAt, end),
        ),
      )
      .groupBy(
        sql`EXTRACT(YEAR FROM ${incomes.occurredAt})`,
        sql`EXTRACT(MONTH FROM ${incomes.occurredAt})`,
      ),
    db
      .select({
        year: sql<number>`EXTRACT(YEAR FROM ${expenses.occurredAt})::int`,
        monthNum: sql<number>`EXTRACT(MONTH FROM ${expenses.occurredAt})::int`,
        total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          gte(expenses.occurredAt, start),
          lte(expenses.occurredAt, end),
        ),
      )
      .groupBy(
        sql`EXTRACT(YEAR FROM ${expenses.occurredAt})`,
        sql`EXTRACT(MONTH FROM ${expenses.occurredAt})`,
      ),
  ]);

  const incomesByMonth = new Map(
    incomeRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );
  const expensesByMonth = new Map(
    expenseRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );

  return slots.map((slot) => {
    const key = monthKey(slot.year, slot.monthNum);
    const incomesTotal = incomesByMonth.get(key) ?? 0;
    const expensesTotal = expensesByMonth.get(key) ?? 0;

    return {
      month: slot.month,
      year: slot.year,
      monthNum: slot.monthNum,
      incomes: incomesTotal,
      expenses: expensesTotal,
      balance: incomesTotal - expensesTotal,
    };
  });
}
