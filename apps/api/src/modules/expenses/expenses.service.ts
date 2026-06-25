import { expenseTags, expenses, getDb } from "@money-manager/db";
import type {
  Expense,
  ExpenseListResponse,
  GoalCategory,
  PaymentMethod,
} from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, count, desc, eq, gte, ilike, inArray, isNull, lt } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";
import { assertTagsBelongToUser } from "../tags/tags.service.js";
import type {
  CreateExpenseBody,
  ListExpensesQuery,
  UpdateExpenseBody,
} from "./expenses.schema.js";

const PAYMENT_METHOD_MAP: Record<number, PaymentMethod> = {
  0: "cash",
  1: "credit_card",
  2: "pix",
};

type ExpenseRow = typeof expenses.$inferSelect;

function monthRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

async function loadTagIds(expenseId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ tagId: expenseTags.tagId })
    .from(expenseTags)
    .where(eq(expenseTags.expenseId, expenseId));
  return rows.map((row) => row.tagId);
}

async function toExpense(
  row: ExpenseRow,
  tagIdsOverride?: string[],
): Promise<Expense> {
  return {
    id: row.id,
    userId: row.userId,
    goalCategory: row.goalCategory as GoalCategory,
    tagIds:
      tagIdsOverride ??
      (await loadTagIds(row.id)),
    amountCents: row.amountCents,
    description: row.description,
    paymentMethod: row.paymentMethod as PaymentMethod,
    cardLastFour: row.cardLastFour,
    source: row.source,
    idempotencyKey: row.idempotencyKey,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function buildListFilters(userId: string, query: ListExpensesQuery) {
  const filters = [eq(expenses.userId, userId), isNull(expenses.deletedAt)];

  if (query.year !== undefined && query.month !== undefined) {
    const { start, end } = monthRange(query.year, query.month);
    filters.push(gte(expenses.occurredAt, start));
    filters.push(lt(expenses.occurredAt, end));
  } else if (query.year !== undefined) {
    const start = new Date(Date.UTC(query.year, 0, 1));
    const end = new Date(Date.UTC(query.year + 1, 0, 1));
    filters.push(gte(expenses.occurredAt, start));
    filters.push(lt(expenses.occurredAt, end));
  }

  if (query.goalCategory) {
    filters.push(eq(expenses.goalCategory, query.goalCategory));
  }

  if (query.description) {
    filters.push(ilike(expenses.description, `%${query.description}%`));
  }

  return filters;
}

async function applyTagFilter(
  userId: string,
  query: ListExpensesQuery,
  filters: ReturnType<typeof buildListFilters>,
) {
  if (!query.tagIds?.length) {
    return filters;
  }

  const linked = await getDb()
    .selectDistinct({ expenseId: expenseTags.expenseId })
    .from(expenseTags)
    .innerJoin(expenses, eq(expenseTags.expenseId, expenses.id))
    .where(
      and(
        inArray(expenseTags.tagId, query.tagIds),
        eq(expenses.userId, userId),
        isNull(expenses.deletedAt),
      ),
    );

  const expenseIds = linked.map((row) => row.expenseId);
  if (expenseIds.length === 0) {
    filters.push(eq(expenses.id, "00000000-0000-0000-0000-000000000000"));
    return filters;
  }

  filters.push(inArray(expenses.id, expenseIds));
  return filters;
}

export async function createExpense(
  userId: string,
  input: CreateExpenseBody,
): Promise<Expense> {
  const amountCents = Math.round(input.amount * 100);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  const paymentMethod = PAYMENT_METHOD_MAP[input.paymentMethodIndex]!;

  if (input.tagIds?.length) {
    await assertTagsBelongToUser(userId, input.tagIds);
  }

  const row = await getDb().transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.idempotencyKey, input.idempotencyKey),
            isNull(expenses.deletedAt),
          ),
        )
        .limit(1);

      if (existing) {
        return { expense: existing, tagIds: undefined as string[] | undefined };
      }
    }

    const id = newId();
    const [inserted] = await tx
      .insert(expenses)
      .values({
        id,
        userId,
        goalCategory: input.goalCategory,
        amountCents,
        description: input.description,
        paymentMethod,
        cardLastFour: input.cardLastFour ?? null,
        source: "manual",
        idempotencyKey: input.idempotencyKey ?? null,
        occurredAt,
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar despesa");
    }

    if (input.tagIds && input.tagIds.length > 0) {
      await tx.insert(expenseTags).values(
        input.tagIds.map((tagId) => ({
          expenseId: id,
          tagId,
        })),
      );
    }

    return { expense: inserted, tagIds: input.tagIds };
  });

  return toExpense(row.expense, row.tagIds);
}

export async function listExpenses(
  userId: string,
  query: ListExpensesQuery,
): Promise<ExpenseListResponse> {
  let filters = buildListFilters(userId, query);
  filters = await applyTagFilter(userId, query, filters);
  const whereClause = and(...filters);

  const [rows, [countRow]] = await Promise.all([
    getDb()
      .select()
      .from(expenses)
      .where(whereClause)
      .orderBy(desc(expenses.occurredAt))
      .limit(query.limit)
      .offset(query.offset),
    getDb()
      .select({ total: count() })
      .from(expenses)
      .where(whereClause),
  ]);

  const items = await Promise.all(rows.map((row) => toExpense(row)));

  return {
    items,
    meta: {
      total: Number(countRow?.total ?? 0),
      limit: query.limit,
      offset: query.offset,
    },
  };
}

export async function getExpense(userId: string, expenseId: string): Promise<Expense> {
  const [row] = await getDb()
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.userId, userId),
        isNull(expenses.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Despesa não encontrada");
  }

  return toExpense(row);
}

export async function updateExpense(
  userId: string,
  expenseId: string,
  input: UpdateExpenseBody,
): Promise<Expense> {
  if (input.tagIds?.length) {
    await assertTagsBelongToUser(userId, input.tagIds);
  }

  const row = await getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existing) {
      throw new NotFoundError("Despesa não encontrada");
    }

    const patch: Partial<typeof expenses.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.amount !== undefined) {
      patch.amountCents = Math.round(input.amount * 100);
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.goalCategory !== undefined) {
      patch.goalCategory = input.goalCategory;
    }
    if (input.occurredAt !== undefined) {
      patch.occurredAt = new Date(input.occurredAt);
    }
    if (input.paymentMethodIndex !== undefined) {
      patch.paymentMethod = PAYMENT_METHOD_MAP[input.paymentMethodIndex];
    }
    if (input.cardLastFour !== undefined) {
      patch.cardLastFour = input.cardLastFour;
    }

    const [updated] = await tx
      .update(expenses)
      .set(patch)
      .where(eq(expenses.id, expenseId))
      .returning();

    if (!updated) {
      throw new NotFoundError("Despesa não encontrada");
    }

    if (input.tagIds !== undefined) {
      await tx.delete(expenseTags).where(eq(expenseTags.expenseId, expenseId));
      if (input.tagIds.length > 0) {
        await tx.insert(expenseTags).values(
          input.tagIds.map((tagId) => ({
            expenseId,
            tagId,
          })),
        );
      }
    }

    return { expense: updated, tagIds: input.tagIds };
  });

  return toExpense(row.expense, row.tagIds);
}

export async function deleteExpense(userId: string, expenseId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.userId, userId),
          isNull(expenses.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existing) {
      throw new NotFoundError("Despesa não encontrada");
    }

    const now = new Date();
    await tx
      .update(expenses)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(expenses.id, expenseId));
  });
}
