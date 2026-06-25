import { getDb, incomeTags, incomes } from "@money-manager/db";
import type { Income, IncomeListResponse } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";
import { assertTagsBelongToUser } from "../tags/tags.service.js";
import type {
  CreateIncomeBody,
  ListIncomesQuery,
  UpdateIncomeBody,
} from "./incomes.schema.js";

type IncomeRow = typeof incomes.$inferSelect;

function monthYearRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

async function loadTagIds(incomeId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ tagId: incomeTags.tagId })
    .from(incomeTags)
    .where(eq(incomeTags.incomeId, incomeId));
  return rows.map((row) => row.tagId);
}

async function toIncome(
  row: IncomeRow,
  tagIdsOverride?: string[],
): Promise<Income> {
  return {
    id: row.id,
    userId: row.userId,
    amountCents: row.amountCents,
    description: row.description,
    source: row.source ?? "other",
    tagIds:
      tagIdsOverride ??
      (await loadTagIds(row.id)),
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildListFilters(userId: string, query: ListIncomesQuery) {
  const filters = [eq(incomes.userId, userId), isNull(incomes.deletedAt)];

  if (query.month !== undefined && query.year !== undefined) {
    const { start, end } = monthYearRange(query.year, query.month);
    filters.push(gte(incomes.occurredAt, start));
    filters.push(lte(incomes.occurredAt, end));
  } else {
    if (query.startDate) {
      filters.push(gte(incomes.occurredAt, new Date(query.startDate)));
    }
    if (query.endDate) {
      filters.push(lte(incomes.occurredAt, new Date(query.endDate)));
    }
  }

  if (query.description) {
    filters.push(ilike(incomes.description, `%${query.description}%`));
  }

  return filters;
}

async function applyTagFilter(
  userId: string,
  query: ListIncomesQuery,
  filters: ReturnType<typeof buildListFilters>,
) {
  if (!query.tagIds?.length) {
    return filters;
  }

  const linked = await getDb()
    .selectDistinct({ incomeId: incomeTags.incomeId })
    .from(incomeTags)
    .innerJoin(incomes, eq(incomeTags.incomeId, incomes.id))
    .where(
      and(
        inArray(incomeTags.tagId, query.tagIds),
        eq(incomes.userId, userId),
        isNull(incomes.deletedAt),
      ),
    );

  const incomeIds = linked.map((row) => row.incomeId);
  if (incomeIds.length === 0) {
    filters.push(eq(incomes.id, "00000000-0000-0000-0000-000000000000"));
    return filters;
  }

  filters.push(inArray(incomes.id, incomeIds));
  return filters;
}

export async function createIncome(
  userId: string,
  input: CreateIncomeBody,
): Promise<Income> {
  const amountCents = Math.round(input.amount * 100);
  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt)
    : new Date();

  if (input.tagIds?.length) {
    await assertTagsBelongToUser(userId, input.tagIds);
  }

  const row = await getDb().transaction(async (tx) => {
    const id = newId();
    const [inserted] = await tx
      .insert(incomes)
      .values({
        id,
        userId,
        amountCents,
        description: input.description,
        source: input.source ?? "other",
        occurredAt,
      })
      .returning();

    if (!inserted) {
      throw new NotFoundError("Falha ao criar receita");
    }

    if (input.tagIds && input.tagIds.length > 0) {
      await tx.insert(incomeTags).values(
        input.tagIds.map((tagId) => ({
          incomeId: id,
          tagId,
        })),
      );
    }

    return { income: inserted, tagIds: input.tagIds };
  });

  return toIncome(row.income, row.tagIds);
}

export async function listIncomes(
  userId: string,
  query: ListIncomesQuery,
): Promise<IncomeListResponse> {
  let filters = buildListFilters(userId, query);
  filters = await applyTagFilter(userId, query, filters);
  const whereClause = and(...filters);

  const [rows, [countRow]] = await Promise.all([
    getDb()
      .select()
      .from(incomes)
      .where(whereClause)
      .orderBy(desc(incomes.occurredAt))
      .limit(query.limit)
      .offset(query.offset),
    getDb()
      .select({ total: count() })
      .from(incomes)
      .where(whereClause),
  ]);

  const items = await Promise.all(rows.map((row) => toIncome(row)));

  return {
    items,
    meta: {
      total: Number(countRow?.total ?? 0),
      limit: query.limit,
      offset: query.offset,
    },
  };
}

export async function getIncome(
  userId: string,
  incomeId: string,
): Promise<Income> {
  const [row] = await getDb()
    .select()
    .from(incomes)
    .where(
      and(
        eq(incomes.id, incomeId),
        eq(incomes.userId, userId),
        isNull(incomes.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Receita não encontrada");
  }

  return toIncome(row);
}

export async function updateIncome(
  userId: string,
  incomeId: string,
  input: UpdateIncomeBody,
): Promise<Income> {
  if (input.tagIds?.length) {
    await assertTagsBelongToUser(userId, input.tagIds);
  }

  const row = await getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(incomes)
      .where(
        and(
          eq(incomes.id, incomeId),
          eq(incomes.userId, userId),
          isNull(incomes.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existing) {
      throw new NotFoundError("Receita não encontrada");
    }

    const patch: Partial<typeof incomes.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.amount !== undefined) {
      patch.amountCents = Math.round(input.amount * 100);
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.source !== undefined) {
      patch.source = input.source;
    }
    if (input.occurredAt !== undefined) {
      patch.occurredAt = new Date(input.occurredAt);
    }

    const [updated] = await tx
      .update(incomes)
      .set(patch)
      .where(eq(incomes.id, incomeId))
      .returning();

    if (!updated) {
      throw new NotFoundError("Receita não encontrada");
    }

    if (input.tagIds !== undefined) {
      await tx.delete(incomeTags).where(eq(incomeTags.incomeId, incomeId));
      if (input.tagIds.length > 0) {
        await tx.insert(incomeTags).values(
          input.tagIds.map((tagId) => ({
            incomeId,
            tagId,
          })),
        );
      }
    }

    return { income: updated, tagIds: input.tagIds };
  });

  return toIncome(row.income, row.tagIds);
}

export async function deleteIncome(
  userId: string,
  incomeId: string,
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(incomes)
    .where(
      and(
        eq(incomes.id, incomeId),
        eq(incomes.userId, userId),
        isNull(incomes.deletedAt),
      ),
    )
    .limit(1)
    .for("update");

  if (!existing) {
    throw new NotFoundError("Receita não encontrada");
  }

  const now = new Date();
  await db
    .update(incomes)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(incomes.id, incomeId));
}
