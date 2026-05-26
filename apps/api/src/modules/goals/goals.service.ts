import { db, expenses, goals, incomes } from "@money-manager/db";
import { localMonthRange, newId } from "@money-manager/utils";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { ValidationError } from "../../shared/errors/app-error.js";
import type { UpsertGoalsBody } from "./goals.schema.js";

export interface Goal {
  id: string;
  category: (typeof goals.$inferSelect)["category"];
  percentage: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalWithUsage extends Goal {
  percentageValue: number;
  ceiling: number;
  spent: number;
  usagePercent: number;
}

export async function upsertGoals(input: UpsertGoalsBody): Promise<Goal[]> {
  const totalPercentage = input.goals.reduce((acc, g) => acc + g.percentage, 0);

  if (Math.round(totalPercentage * 100) !== 10000) {
    throw new ValidationError("A soma das metas deve ser exatamente 100%");
  }

  const now = new Date();
  const existingGoals = await db.select().from(goals);

  const insertValues: Array<typeof goals.$inferInsert> = input.goals.map((g) => {
    const existing = existingGoals.find((eg) => eg.category === g.category);
    if (existing) {
      return {
        id: existing.id,
        category: g.category,
        percentage: String(g.percentage),
        isActive: true,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
    }
    return {
      id: newId(),
      category: g.category,
      percentage: String(g.percentage),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  });

  await db.transaction(async (tx) => {
    await tx.delete(goals);
    await tx.insert(goals).values(insertValues);
  });

  const rows = await db.select().from(goals);
  return rows as Goal[];
}

export async function listGoals(): Promise<Goal[]> {
  const rows = await db.select().from(goals);
  return rows as Goal[];
}

export async function getGoalUsage(
  year: number,
  month: number
): Promise<GoalWithUsage[]> {
  const allGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.isActive, true));

  const { start: startDate, end: endDate } = localMonthRange(year, month);

  const incomesResult = await db
    .select({ total: sql<number>`COALESCE(SUM(${incomes.amountCents}), 0)` })
    .from(incomes)
    .where(
      and(
        isNull(incomes.deletedAt),
        gte(incomes.occurredAt, startDate),
        lte(incomes.occurredAt, endDate)
      )
    );

  const totalIncomes = Number(incomesResult[0]?.total ?? 0);

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

  return allGoals.map((goal): GoalWithUsage => {
    const row = goal as Goal;
    const percentageValue = parseFloat(row.percentage);
    const ceiling = Math.round((totalIncomes * percentageValue) / 100);
    const spent = spentByCategory.get(row.category) ?? 0;
    const usagePercent = ceiling > 0 ? Math.round((spent / ceiling) * 100) : 0;

    return {
      ...row,
      percentageValue,
      ceiling,
      spent,
      usagePercent,
    };
  });
}
