import { getDb, piggyBankTransactions, piggyBanks } from "@money-manager/db";
import type {
  PiggyBank,
  PiggyBankTransaction,
  PiggyBankTransactionType,
} from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type {
  CreatePiggyBankBody,
  ListPiggyBankTransactionsQuery,
  ListPiggyBanksQuery,
  PiggyBankTransactionBody,
  UpdatePiggyBankBody,
  UpdatePiggyBankStatusBody,
} from "./piggy-banks.schema.js";

type PiggyBankRow = typeof piggyBanks.$inferSelect;
type PiggyBankTransactionRow = typeof piggyBankTransactions.$inferSelect;

function toPiggyBank(row: PiggyBankRow): PiggyBank {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    icon: row.icon,
    currentAmountCents: row.currentAmountCents,
    targetAmountCents: row.targetAmountCents,
    goalDescription: row.goalDescription,
    targetDate: row.targetDate,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toPiggyBankTransaction(
  row: PiggyBankTransactionRow,
): PiggyBankTransaction {
  return {
    id: row.id,
    piggyBankId: row.piggyBankId,
    type: row.type,
    amountCents: row.amountCents,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// NOTE: no longer called from applyTransaction below — the balance write
// path now delegates the arithmetic (and the insufficient-balance check) to
// the database itself via an atomic UPDATE, to avoid a lost-update race
// under concurrent deposit/withdraw requests. Kept exported/unit-tested as a
// documented reference for the same balance rules the DB now enforces.
export function resolveBalanceAfterTransaction(
  currentAmountCents: number,
  type: PiggyBankTransactionType,
  amountCents: number,
): number {
  if (type === "deposit") {
    return currentAmountCents + amountCents;
  }

  if (amountCents > currentAmountCents) {
    throw new BadRequestError("Saldo insuficiente no cofrinho");
  }
  return currentAmountCents - amountCents;
}

async function getPiggyBankRow(
  userId: string,
  piggyBankId: string,
): Promise<PiggyBankRow> {
  const [row] = await getDb()
    .select()
    .from(piggyBanks)
    .where(
      and(
        eq(piggyBanks.id, piggyBankId),
        eq(piggyBanks.userId, userId),
        isNull(piggyBanks.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Cofrinho não encontrado");
  }

  return row;
}

export async function listPiggyBanks(
  userId: string,
  query: ListPiggyBanksQuery,
): Promise<{ items: PiggyBank[] }> {
  const conditions = [
    eq(piggyBanks.userId, userId),
    isNull(piggyBanks.deletedAt),
  ];
  if (query.status) {
    conditions.push(eq(piggyBanks.status, query.status));
  }

  const rows = await getDb()
    .select()
    .from(piggyBanks)
    .where(and(...conditions))
    .orderBy(piggyBanks.createdAt);

  return { items: rows.map(toPiggyBank) };
}

export async function getPiggyBank(
  userId: string,
  piggyBankId: string,
): Promise<PiggyBank> {
  const row = await getPiggyBankRow(userId, piggyBankId);
  return toPiggyBank(row);
}

export async function createPiggyBank(
  userId: string,
  input: CreatePiggyBankBody,
): Promise<PiggyBank> {
  const now = new Date();
  const id = newId();

  await getDb()
    .insert(piggyBanks)
    .values({
      id,
      userId,
      name: input.name,
      icon: input.icon ?? null,
      currentAmountCents: 0,
      targetAmountCents: input.targetAmountCents ?? null,
      goalDescription: input.goalDescription ?? null,
      targetDate: input.targetDate ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

  return getPiggyBank(userId, id);
}

export async function updatePiggyBank(
  userId: string,
  piggyBankId: string,
  input: UpdatePiggyBankBody,
): Promise<PiggyBank> {
  await getPiggyBankRow(userId, piggyBankId);

  const updates: Partial<PiggyBankRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.icon !== undefined) updates.icon = input.icon;
  if (input.targetAmountCents !== undefined) {
    updates.targetAmountCents = input.targetAmountCents;
  }
  if (input.goalDescription !== undefined) {
    updates.goalDescription = input.goalDescription;
  }
  if (input.targetDate !== undefined) updates.targetDate = input.targetDate;

  await getDb()
    .update(piggyBanks)
    .set(updates)
    .where(eq(piggyBanks.id, piggyBankId));

  return getPiggyBank(userId, piggyBankId);
}

export async function deletePiggyBank(
  userId: string,
  piggyBankId: string,
): Promise<void> {
  await getPiggyBankRow(userId, piggyBankId);
  const now = new Date();

  await getDb()
    .update(piggyBanks)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(piggyBanks.id, piggyBankId));
}

async function applyTransaction(
  userId: string,
  piggyBankId: string,
  type: PiggyBankTransactionType,
  input: PiggyBankTransactionBody,
): Promise<PiggyBank> {
  // Existence/ownership check only — the actual balance mutation below is
  // computed atomically by the database (not from this row) to avoid a
  // lost-update race between concurrent deposit/withdraw requests.
  await getPiggyBankRow(userId, piggyBankId);
  const now = new Date();

  await getDb().transaction(async (tx) => {
    if (type === "deposit") {
      await tx
        .update(piggyBanks)
        .set({
          currentAmountCents: sql`${piggyBanks.currentAmountCents} + ${input.amountCents}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(piggyBanks.id, piggyBankId),
            eq(piggyBanks.userId, userId),
            isNull(piggyBanks.deletedAt),
          ),
        );
    } else {
      const [updated] = await tx
        .update(piggyBanks)
        .set({
          currentAmountCents: sql`${piggyBanks.currentAmountCents} - ${input.amountCents}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(piggyBanks.id, piggyBankId),
            eq(piggyBanks.userId, userId),
            isNull(piggyBanks.deletedAt),
            gte(piggyBanks.currentAmountCents, input.amountCents),
          ),
        )
        .returning({ id: piggyBanks.id });

      // Zero rows affected here means the WHERE guard failed. Existence and
      // ownership were already confirmed by getPiggyBankRow above, so in
      // practice this means the balance check (currentAmountCents >=
      // amountCents) failed, i.e. insufficient funds.
      if (!updated) {
        throw new BadRequestError("Saldo insuficiente no cofrinho");
      }
    }

    await tx.insert(piggyBankTransactions).values({
      id: newId(),
      piggyBankId,
      userId,
      type,
      amountCents: input.amountCents,
      note: input.note ?? null,
      occurredAt: now,
      createdAt: now,
    });
  });

  return getPiggyBank(userId, piggyBankId);
}

export async function depositToPiggyBank(
  userId: string,
  piggyBankId: string,
  input: PiggyBankTransactionBody,
): Promise<PiggyBank> {
  return applyTransaction(userId, piggyBankId, "deposit", input);
}

export async function withdrawFromPiggyBank(
  userId: string,
  piggyBankId: string,
  input: PiggyBankTransactionBody,
): Promise<PiggyBank> {
  return applyTransaction(userId, piggyBankId, "withdrawal", input);
}

export async function updatePiggyBankStatus(
  userId: string,
  piggyBankId: string,
  input: UpdatePiggyBankStatusBody,
): Promise<PiggyBank> {
  await getPiggyBankRow(userId, piggyBankId);

  await getDb()
    .update(piggyBanks)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(piggyBanks.id, piggyBankId));

  return getPiggyBank(userId, piggyBankId);
}

export async function listPiggyBankTransactions(
  userId: string,
  piggyBankId: string,
  query: ListPiggyBankTransactionsQuery,
): Promise<{
  items: PiggyBankTransaction[];
  meta: { total: number; limit: number; offset: number };
}> {
  await getPiggyBankRow(userId, piggyBankId);

  const [rows, totalResult] = await Promise.all([
    getDb()
      .select()
      .from(piggyBankTransactions)
      .where(eq(piggyBankTransactions.piggyBankId, piggyBankId))
      .orderBy(desc(piggyBankTransactions.occurredAt))
      .limit(query.limit)
      .offset(query.offset),
    getDb()
      .select({ total: count() })
      .from(piggyBankTransactions)
      .where(eq(piggyBankTransactions.piggyBankId, piggyBankId)),
  ]);

  return {
    items: rows.map(toPiggyBankTransaction),
    meta: {
      total: totalResult[0]?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    },
  };
}
