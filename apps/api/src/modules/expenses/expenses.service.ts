import { db, expenseTags, expenses } from "@money-manager/db";
import type { Expense, PaymentMethod } from "@money-manager/types";
import {
  newId,
  normalizeOccurredAtDate,
  parseOccurredAt,
} from "@money-manager/utils";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { ciLike } from "../../shared/db/sql-helpers.js";
import { NotFoundError } from "../../shared/errors/app-error.js";
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

export async function createExpense(input: CreateExpenseBody): Promise<Expense> {
  const amountCents = Math.round(input.amount * 100);
  const occurredAt = parseOccurredAt(input.occurredAt);
  const paymentMethod = PAYMENT_METHOD_MAP[input.paymentMethodIndex]!;
  const now = new Date();

  return await db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.idempotencyKey, input.idempotencyKey),
            isNull(expenses.deletedAt)
          )
        )
        .limit(1);

      if (existing) {
        return getExpense(existing.id);
      }
    }

    const id = newId();
    const insertedRows = (await tx
      .insert(expenses)
      .values({
        id,
        amountCents,
        description: input.description,
        goalCategory: input.goalCategory,
        paymentMethod,
        cardLastFour: input.cardLastFour ?? null,
        source: "manual",
        idempotencyKey: input.idempotencyKey ?? null,
        occurredAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning()) as Expense[];
    const inserted = insertedRows[0];
    if (!inserted) {
      throw new Error("Falha ao criar despesa");
    }

    if (input.tagIds && input.tagIds.length > 0) {
      await tx.insert(expenseTags).values(
        input.tagIds.map((tagId) => ({
          expenseId: id,
          tagId,
        }))
      );
    }

    return {
      ...(inserted as Expense),
      occurredAt: normalizeOccurredAtDate(inserted.occurredAt),
      tagIds: input.tagIds,
    };
  });
}

export async function listExpenses(
  query: ListExpensesQuery
): Promise<{ items: Expense[]; total: number }> {
  const filters = [isNull(expenses.deletedAt)];

  if (query.startDate) {
    filters.push(gte(expenses.occurredAt, parseOccurredAt(query.startDate)));
  }
  if (query.endDate) {
    filters.push(lte(expenses.occurredAt, parseOccurredAt(query.endDate)));
  }
  if (query.description) {
    filters.push(ciLike(expenses.description, `%${query.description}%`));
  }

  const limit = query.limit;
  const offset = query.offset;

  const items = await db
    .select()
    .from(expenses)
    .where(and(...filters))
    .orderBy(desc(expenses.occurredAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(and(...filters));

  const itemsWithTags = await Promise.all(
    items.map(async (item) => {
      const tagRelations = await db
        .select({ tagId: expenseTags.tagId })
        .from(expenseTags)
        .where(eq(expenseTags.expenseId, item.id));

      return {
        ...item,
        occurredAt: normalizeOccurredAtDate(item.occurredAt),
        tagIds: tagRelations.map((t) => t.tagId),
      } as Expense;
    })
  );

  const total = Number(countRow?.count ?? items.length);

  return {
    items: itemsWithTags,
    total,
  };
}

export async function updateExpense(
  expenseId: string,
  input: UpdateExpenseBody
): Promise<Expense> {
  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Expense not found");
  }

  const values: Partial<typeof expenses.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.amount !== undefined) {
    values.amountCents = Math.round(input.amount * 100);
  }
  if (input.description !== undefined) {
    values.description = input.description;
  }
  if (input.goalCategory !== undefined) {
    values.goalCategory = input.goalCategory;
  }
  if (input.occurredAt !== undefined) {
    values.occurredAt = parseOccurredAt(input.occurredAt);
  }
  if (input.paymentMethodIndex !== undefined) {
    values.paymentMethod = PAYMENT_METHOD_MAP[input.paymentMethodIndex];
  }
  if (input.cardLastFour !== undefined) {
    values.cardLastFour = input.cardLastFour;
  }

  await db.update(expenses).set(values).where(eq(expenses.id, expenseId));

  if (input.tagIds !== undefined) {
    await db.delete(expenseTags).where(eq(expenseTags.expenseId, expenseId));
    if (input.tagIds.length > 0) {
      await db.insert(expenseTags).values(
        input.tagIds.map((tagId) => ({
          expenseId,
          tagId,
        }))
      );
    }
  }

  return getExpense(expenseId);
}

export async function getExpense(expenseId: string): Promise<Expense> {
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
    .limit(1);

  if (!expense) {
    throw new NotFoundError("Expense not found");
  }

  const tagRelations = await db
    .select({ tagId: expenseTags.tagId })
    .from(expenseTags)
    .where(eq(expenseTags.expenseId, expense.id));

  return {
    ...expense,
    occurredAt: normalizeOccurredAtDate(expense.occurredAt),
    tagIds: tagRelations.map((t) => t.tagId),
  } as Expense;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Expense not found");
  }

  await db
    .update(expenses)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(expenses.id, expenseId));
}
