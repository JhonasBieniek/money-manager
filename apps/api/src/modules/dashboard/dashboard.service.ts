import { db, expenses, incomes, goals } from "@money-manager/db";
import { localMonthRange } from "@money-manager/utils";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

export interface DashboardSummary {
  totalIncomes: number;
  totalExpenses: number;
  balance: number;
  expensesByCategory: Array<{ category: string; amount: number }>;
  goalsUsage: Array<{
    category: string;
    percentage: number;
    ceiling: number;
    spent: number;
    usagePercent: number;
  }>;
}

export interface HistoryMonth {
  month: string;
  year: number;
  monthNum: number;
  incomes: number;
  expenses: number;
  balance: number;
}

export async function getDashboardSummary(
  year: number,
  month: number
): Promise<DashboardSummary> {
  const { start: startDate, end: endDate } = localMonthRange(year, month);

  const [incomesResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${incomes.amountCents}), 0)` })
    .from(incomes)
    .where(
      and(
        isNull(incomes.deletedAt),
        gte(incomes.occurredAt, startDate),
        lte(incomes.occurredAt, endDate)
      )
    );

  const [expensesResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)` })
    .from(expenses)
    .where(
      and(
        isNull(expenses.deletedAt),
        gte(expenses.occurredAt, startDate),
        lte(expenses.occurredAt, endDate)
      )
    );

  const totalIncomes = Number(incomesResult?.total ?? 0);
  const totalExpenses = Number(expensesResult?.total ?? 0);
  const balance = totalIncomes - totalExpenses;

  const goalsList = await db
    .select()
    .from(goals)
    .where(eq(goals.isActive, true));

  const spentRows = await db
    .select({
      category: expenses.goalCategory,
      total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        isNull(expenses.deletedAt),
        gte(expenses.occurredAt, startDate),
        lte(expenses.occurredAt, endDate)
      )
    )
    .groupBy(expenses.goalCategory);

  const spentByCategory = new Map(
    spentRows.map((r) => [r.category, Number(r.total ?? 0)])
  );

  const goalsUsage = goalsList.map((goal) => {
    const percentage = parseFloat(goal.percentage);
    const ceiling = Math.round((totalIncomes * percentage) / 100);
    const spent = spentByCategory.get(goal.category) ?? 0;
    const usagePercent = ceiling > 0 ? Math.round((spent / ceiling) * 100) : 0;

    return {
      category: goal.category,
      percentage,
      ceiling,
      spent,
      usagePercent,
    };
  });

  return {
    totalIncomes,
    totalExpenses,
    balance,
    expensesByCategory: [],
    goalsUsage,
  };
}

export async function getDashboardHistory(months: number): Promise<HistoryMonth[]> {
  const now = new Date();
  const result: HistoryMonth[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const { start: startDate, end: endDate } = localMonthRange(year, month);

    const [incomesResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${incomes.amountCents}), 0)` })
      .from(incomes)
      .where(
        and(
          isNull(incomes.deletedAt),
          gte(incomes.occurredAt, startDate),
          lte(incomes.occurredAt, endDate)
        )
      );

    const [expensesResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)` })
      .from(expenses)
      .where(
        and(
          isNull(expenses.deletedAt),
          gte(expenses.occurredAt, startDate),
          lte(expenses.occurredAt, endDate)
        )
      );

    const incomesTotal = Number(incomesResult?.total ?? 0);
    const expensesTotal = Number(expensesResult?.total ?? 0);

    result.push({
      month: monthStr,
      year,
      monthNum: month,
      incomes: incomesTotal,
      expenses: expensesTotal,
      balance: incomesTotal - expensesTotal,
    });
  }

  return result;
}
