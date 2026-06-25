import { getDb, goals } from "@money-manager/db";
import type { Goal, GoalWithUsage } from "@money-manager/types";
import { GOAL_CATEGORIES } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq } from "drizzle-orm";
import { BadRequestError } from "../../shared/errors/app-error.js";
import type { UpsertGoalsBody } from "./goals.schema.js";

type GoalRow = typeof goals.$inferSelect;

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category,
    percentage: row.percentage,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertGoals(
  userId: string,
  input: UpsertGoalsBody,
): Promise<Goal[]> {
  const categoriesInPayload = new Set(input.goals.map((g) => g.category));
  if (categoriesInPayload.size !== GOAL_CATEGORIES.length) {
    throw new BadRequestError("Informe exatamente as 6 categorias de meta");
  }

  const totalPercentage = input.goals.reduce(
    (acc, goal) => acc + goal.percentage,
    0,
  );

  if (Math.round(totalPercentage * 100) !== 10000) {
    throw new BadRequestError("A soma das metas deve ser exatamente 100%");
  }

  const db = getDb();
  const now = new Date();
  const existingGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId));

  const insertValues: Array<typeof goals.$inferInsert> = input.goals.map(
    (goal) => {
      const existing = existingGoals.find((eg) => eg.category === goal.category);
      if (existing) {
        return {
          id: existing.id,
          userId,
          category: goal.category,
          percentage: String(goal.percentage),
          isActive: true,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
      }
      return {
        id: newId(),
        userId,
        category: goal.category,
        percentage: String(goal.percentage),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
    },
  );

  await db.transaction(async (tx) => {
    await tx.delete(goals).where(eq(goals.userId, userId));
    await tx.insert(goals).values(insertValues);
  });

  const rows = await db.select().from(goals).where(eq(goals.userId, userId));
  return rows.map(toGoal);
}

export async function listGoals(userId: string): Promise<Goal[]> {
  const rows = await getDb()
    .select()
    .from(goals)
    .where(eq(goals.userId, userId));
  return rows.map(toGoal);
}

export async function getGoalUsage(
  userId: string,
  _year: number,
  _month: number,
): Promise<GoalWithUsage[]> {
  const db = getDb();

  const allGoals = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.isActive, true)));

  // TODO(F06/F07): aggregate incomes for ceiling and expenses by goal_category for spent.
  const totalIncomes = 0;
  const spentByCategory = new Map<string, number>();

  return allGoals.map((goal) => {
    const percentageValue = parseFloat(goal.percentage);
    const ceiling = Math.round((totalIncomes * percentageValue) / 100);
    const spent = spentByCategory.get(goal.category) ?? 0;
    const usagePercent =
      ceiling > 0 ? Math.round((spent / ceiling) * 100) : spent > 0 ? 100 : 0;

    return {
      ...toGoal(goal),
      percentageValue,
      ceiling,
      spent,
      usagePercent,
    };
  });
}
