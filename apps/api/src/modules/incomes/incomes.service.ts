import { db, incomes, incomeTags } from "@money-manager/db";
import {
  newId,
  normalizeOccurredAtDate,
  parseOccurredAt,
} from "@money-manager/utils";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { ciLike } from "../../shared/db/sql-helpers.js";
import { NotFoundError } from "../../shared/errors/app-error.js";

export interface Income {
  id: string;
  amountCents: number;
  description: string;
  source: string;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  tagIds?: string[];
}

export interface CreateIncomeBody {
  amount: number;
  description: string;
  source?: string;
  occurredAt?: string;
  tagIds?: string[];
}

export interface ListIncomesQuery {
  startDate?: string;
  endDate?: string;
  description?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateIncomeBody {
  amount?: number;
  description?: string;
  source?: string;
  occurredAt?: string;
  tagIds?: string[];
}

export async function createIncome(input: CreateIncomeBody): Promise<Income> {
  const amountCents = Math.round(input.amount * 100);
  const occurredAt = parseOccurredAt(input.occurredAt);
  const now = new Date();

  return await db.transaction(async (tx) => {
    const id = newId();
    const insertedRows = (await tx
      .insert(incomes)
      .values({
        id,
        amountCents,
        description: input.description,
        source: input.source ?? "other",
        occurredAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning()) as Income[];
    const inserted = insertedRows[0];
    if (!inserted) {
      throw new Error("Falha ao criar receita");
    }

    if (input.tagIds && input.tagIds.length > 0) {
      await tx.insert(incomeTags).values(
        input.tagIds.map((tagId) => ({
          incomeId: id,
          tagId,
        }))
      );
    }

    return {
      ...inserted,
      occurredAt: normalizeOccurredAtDate(inserted.occurredAt),
      tagIds: input.tagIds,
    } as Income;
  });
}

export async function listIncomes(
  query: ListIncomesQuery
): Promise<{ items: Income[]; total: number }> {
  const filters = [isNull(incomes.deletedAt)];

  if (query.startDate) {
    filters.push(gte(incomes.occurredAt, parseOccurredAt(query.startDate)));
  }
  if (query.endDate) {
    filters.push(lte(incomes.occurredAt, parseOccurredAt(query.endDate)));
  }
  if (query.description) {
    filters.push(ciLike(incomes.description, `%${query.description}%`));
  }

  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  const items = await db
    .select()
    .from(incomes)
    .where(and(...filters))
    .orderBy(desc(incomes.occurredAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(incomes)
    .where(and(...filters));

  const itemsWithTags = await Promise.all(
    items.map(async (item) => {
      const tagRelations = await db
        .select({ tagId: incomeTags.tagId })
        .from(incomeTags)
        .where(eq(incomeTags.incomeId, item.id));

      return {
        ...item,
        occurredAt: normalizeOccurredAtDate(item.occurredAt),
        tagIds: tagRelations.map((t) => t.tagId),
      } as Income;
    })
  );

  return {
    items: itemsWithTags,
    total: Number(countRow?.count ?? items.length),
  };
}

export async function getIncome(incomeId: string): Promise<Income> {
  const [income] = await db
    .select()
    .from(incomes)
    .where(and(eq(incomes.id, incomeId), isNull(incomes.deletedAt)))
    .limit(1);

  if (!income) {
    throw new NotFoundError("Income not found");
  }

  const tagRelations = await db
    .select({ tagId: incomeTags.tagId })
    .from(incomeTags)
    .where(eq(incomeTags.incomeId, income.id));

  return {
    ...income,
    occurredAt: normalizeOccurredAtDate(income.occurredAt),
    tagIds: tagRelations.map((t) => t.tagId),
  } as Income;
}

export async function updateIncome(
  incomeId: string,
  input: UpdateIncomeBody
): Promise<Income> {
  const [existing] = await db
    .select()
    .from(incomes)
    .where(and(eq(incomes.id, incomeId), isNull(incomes.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Income not found");
  }

  const values: Partial<typeof incomes.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.amount !== undefined) {
    values.amountCents = Math.round(input.amount * 100);
  }
  if (input.description !== undefined) {
    values.description = input.description;
  }
  if (input.source !== undefined) {
    values.source = input.source;
  }
  if (input.occurredAt !== undefined) {
    values.occurredAt = parseOccurredAt(input.occurredAt);
  }

  await db.update(incomes).set(values).where(eq(incomes.id, incomeId));

  if (input.tagIds !== undefined) {
    await db.delete(incomeTags).where(eq(incomeTags.incomeId, incomeId));
    if (input.tagIds.length > 0) {
      await db.insert(incomeTags).values(
        input.tagIds.map((tagId) => ({
          incomeId,
          tagId,
        }))
      );
    }
  }

  return getIncome(incomeId);
}

export async function deleteIncome(incomeId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(incomes)
    .where(and(eq(incomes.id, incomeId), isNull(incomes.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Income not found");
  }

  await db
    .update(incomes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(incomes.id, incomeId));
}

export async function getTotalIncomesForMonth(
  year: number,
  month: number
): Promise<number> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const result = await db
    .select({ total: incomes.amountCents })
    .from(incomes)
    .where(
      and(
        isNull(incomes.deletedAt),
        gte(incomes.occurredAt, startDate),
        lte(incomes.occurredAt, endDate)
      )
    );

  return result.reduce((acc, row) => acc + row.total, 0);
}
