import { creditCardStatements, expenses, getDb, incomes } from "@money-manager/db";
import type {
  DashboardHistoryMonth,
  DashboardSummary,
} from "@money-manager/types";
import { GOAL_CATEGORY_LABELS } from "@money-manager/types";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { syncUserDebtsForMonth } from "../debts/debts.service.js";
import * as goalsService from "../goals/goals.service.js";
import { todayBrtString } from "../investments/brt-date.js";
import {
  budgetMonthExpenseCondition,
  previousMonth,
} from "../../shared/budget-month.js";

function monthYearRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export function buildMonthSlots(
  now: Date,
  months: number,
): Array<{ year: number; monthNum: number; month: string }> {
  const [brtYear, brtMonth] = todayBrtString(now).split("-").map(Number);
  const slots: Array<{ year: number; monthNum: number; month: string }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(brtYear, brtMonth - 1 - i, 1);
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
  // Gastos não-cartão contam no mês seguinte: para o mês selecionado usamos os
  // ocorridos no mês anterior. Cartão continua pelo ciclo da fatura (cycleMonth).
  const prev = previousMonth(year, month);
  // As parcelas de dívida auto-sincronizadas são despesas datadas no mês da
  // parcela; como elas também deslocam +1 mês, o resumo do mês selecionado
  // precisa garantir a sincronização do mês anterior (cujas parcelas aparecem
  // aqui) e do próprio mês.
  await Promise.all([
    syncUserDebtsForMonth(userId, prev.year, prev.month),
    syncUserDebtsForMonth(userId, year, month),
  ]);
  const { start, end } = monthYearRange(year, month);
  const prevRange = monthYearRange(prev.year, prev.month);

  const [
    incomesResult,
    expensesResult,
    cardStatementsResult,
    categoryRows,
    goalsUsageRows,
  ] = await Promise.all([
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
          isNull(expenses.creditCardStatementId),
          gte(expenses.occurredAt, prevRange.start),
          lte(expenses.occurredAt, prevRange.end),
        ),
      ),
    db
      .select({
        total: sql<number>`COALESCE(SUM(COALESCE(${creditCardStatements.adjustedTotalCents}, ${creditCardStatements.calculatedTotalCents})), 0)::int`,
      })
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.userId, userId),
          eq(creditCardStatements.cycleYear, year),
          eq(creditCardStatements.cycleMonth, month),
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
          budgetMonthExpenseCondition(userId, year, month),
        ),
      )
      .groupBy(expenses.goalCategory),
    goalsService.getGoalUsage(userId, year, month),
  ]);

  const totalIncomes = incomesResult[0]?.total ?? 0;
  const nonCreditCardExpenses = expensesResult[0]?.total ?? 0;
  const creditCardBillsTotal = cardStatementsResult[0]?.total ?? 0;
  const totalExpenses = nonCreditCardExpenses + creditCardBillsTotal;

  const expensesByCategory = categoryRows
    .filter((row) => row.category !== null && (row.total ?? 0) > 0)
    .map((row) => ({
      category: GOAL_CATEGORY_LABELS[row.category!] ?? row.category!,
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
  const slots = buildMonthSlots(new Date(), months);
  const first = slots[0];
  const last = slots[slots.length - 1];

  if (!first || !last) {
    return [];
  }

  const { start } = monthYearRange(first.year, first.monthNum);
  const { end } = monthYearRange(last.year, last.monthNum);

  // Despesas não-cartão contam no mês seguinte ao gasto. Para preencher o
  // primeiro slot precisamos também das despesas do mês anterior a ele, e
  // agrupamos por (occurredAt + 1 mês) para deslocá-las para frente.
  const prevOfFirst = previousMonth(first.year, first.monthNum);
  const { start: expenseStart } = monthYearRange(
    prevOfFirst.year,
    prevOfFirst.month,
  );
  const budgetMonthExpr = sql`(${expenses.occurredAt} + interval '1 month')`;

  const monthKey = (year: number, monthNum: number) => `${year}-${monthNum}`;

  const [incomeRows, expenseRows, cardStatementRows] = await Promise.all([
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
        year: sql<number>`EXTRACT(YEAR FROM ${budgetMonthExpr})::int`,
        monthNum: sql<number>`EXTRACT(MONTH FROM ${budgetMonthExpr})::int`,
        total: sql<number>`COALESCE(SUM(${expenses.amountCents}), 0)::int`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
          isNull(expenses.creditCardStatementId),
          gte(expenses.occurredAt, expenseStart),
          lte(expenses.occurredAt, end),
        ),
      )
      .groupBy(
        sql`EXTRACT(YEAR FROM ${budgetMonthExpr})`,
        sql`EXTRACT(MONTH FROM ${budgetMonthExpr})`,
      ),
    db
      .select({
        year: creditCardStatements.cycleYear,
        monthNum: creditCardStatements.cycleMonth,
        total: sql<number>`COALESCE(SUM(COALESCE(${creditCardStatements.adjustedTotalCents}, ${creditCardStatements.calculatedTotalCents})), 0)::int`,
      })
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.userId, userId),
          or(
            ...slots.map((slot) =>
              and(
                eq(creditCardStatements.cycleYear, slot.year),
                eq(creditCardStatements.cycleMonth, slot.monthNum),
              ),
            ),
          ),
        ),
      )
      .groupBy(creditCardStatements.cycleYear, creditCardStatements.cycleMonth),
  ]);

  const incomesByMonth = new Map(
    incomeRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );
  const nonCreditCardExpensesByMonth = new Map(
    expenseRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );
  const creditCardBillsByMonth = new Map(
    cardStatementRows.map((row) => [monthKey(row.year, row.monthNum), row.total ?? 0]),
  );

  return slots.map((slot) => {
    const key = monthKey(slot.year, slot.monthNum);
    const incomesTotal = incomesByMonth.get(key) ?? 0;
    const expensesTotal =
      (nonCreditCardExpensesByMonth.get(key) ?? 0) +
      (creditCardBillsByMonth.get(key) ?? 0);

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
