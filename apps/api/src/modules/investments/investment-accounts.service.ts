import {
  getDb,
  investmentAccounts,
  investmentHoldings,
} from "@money-manager/db";
import type { InvestmentAccount } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";
import type {
  CreateInvestmentAccountBody,
  UpdateInvestmentAccountBody,
} from "./investment-accounts.schema.js";

type InvestmentAccountRow = typeof investmentAccounts.$inferSelect;

function toInvestmentAccount(row: InvestmentAccountRow): InvestmentAccount {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type,
    institution: row.institution,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function getInvestmentAccountRow(
  userId: string,
  accountId: string,
): Promise<InvestmentAccountRow> {
  const [row] = await getDb()
    .select()
    .from(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.id, accountId),
        eq(investmentAccounts.userId, userId),
        isNull(investmentAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Conta não encontrada");
  }

  return row;
}

export async function listInvestmentAccounts(
  userId: string,
): Promise<{ items: InvestmentAccount[] }> {
  const rows = await getDb()
    .select()
    .from(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.userId, userId),
        isNull(investmentAccounts.deletedAt),
      ),
    )
    .orderBy(investmentAccounts.createdAt);

  return { items: rows.map(toInvestmentAccount) };
}

export async function getInvestmentAccount(
  userId: string,
  accountId: string,
): Promise<InvestmentAccount> {
  const row = await getInvestmentAccountRow(userId, accountId);
  return toInvestmentAccount(row);
}

export async function createInvestmentAccount(
  userId: string,
  input: CreateInvestmentAccountBody,
): Promise<InvestmentAccount> {
  const now = new Date();
  const id = newId();

  await getDb()
    .insert(investmentAccounts)
    .values({
      id,
      userId,
      name: input.name,
      type: input.type,
      institution: input.institution ?? null,
      createdAt: now,
      updatedAt: now,
    });

  return getInvestmentAccount(userId, id);
}

export async function updateInvestmentAccount(
  userId: string,
  accountId: string,
  input: UpdateInvestmentAccountBody,
): Promise<InvestmentAccount> {
  await getInvestmentAccountRow(userId, accountId);

  const updates: Partial<InvestmentAccountRow> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.type !== undefined) updates.type = input.type;
  if (input.institution !== undefined) updates.institution = input.institution;

  await getDb()
    .update(investmentAccounts)
    .set(updates)
    .where(eq(investmentAccounts.id, accountId));

  return getInvestmentAccount(userId, accountId);
}

export async function deleteInvestmentAccount(
  userId: string,
  accountId: string,
): Promise<void> {
  await getInvestmentAccountRow(userId, accountId);
  const now = new Date();

  await getDb().transaction(async (tx) => {
    await tx
      .update(investmentAccounts)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(investmentAccounts.id, accountId));

    await tx
      .update(investmentHoldings)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(investmentHoldings.accountId, accountId),
          isNull(investmentHoldings.deletedAt),
        ),
      );
  });
}
