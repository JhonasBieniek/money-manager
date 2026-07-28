import {
  getDb,
  investmentAccounts,
  investmentHoldings,
} from "@money-manager/db";
import type { AssetClass, InvestmentHolding } from "@money-manager/types";
import { newId } from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import { refreshHoldingQuote } from "./pricing/quote-refresh.service.js";
import { pricingSourceForAssetClass } from "./pricing/types.js";
import type {
  CreateInvestmentHoldingBody,
  ListInvestmentHoldingsQuery,
  UpdateHoldingQuoteModeBody,
  UpdateHoldingValuationBody,
  UpdateInvestmentHoldingBody,
} from "./investment-holdings.schema.js";

type InvestmentHoldingRow = typeof investmentHoldings.$inferSelect;

function trimTrailingZeros(numericString: string): string {
  if (!numericString.includes(".")) return numericString;
  return numericString.replace(/\.?0+$/, "");
}

function toInvestmentHolding(row: InvestmentHoldingRow): InvestmentHolding {
  return {
    id: row.id,
    accountId: row.accountId,
    userId: row.userId,
    symbol: row.symbol,
    incomeType: row.incomeType,
    assetClass: row.assetClass,
    quantity: trimTrailingZeros(row.quantity),
    averageCostCents: row.averageCostCents,
    currentUnitValueCents: row.currentUnitValueCents,
    maturityDate: row.maturityDate,
    pricingSource: row.pricingSource,
    manualOverride: row.manualOverride,
    lastQuoteError: row.lastQuoteError,
    notes: row.notes,
    lastValuationAt: row.lastValuationAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

async function assertAccountBelongsToUser(
  userId: string,
  accountId: string,
): Promise<void> {
  const [account] = await getDb()
    .select({ id: investmentAccounts.id })
    .from(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.id, accountId),
        eq(investmentAccounts.userId, userId),
        isNull(investmentAccounts.deletedAt),
      ),
    )
    .limit(1);

  if (!account) {
    throw new BadRequestError("Conta de investimento inválida");
  }
}

async function getInvestmentHoldingRow(
  userId: string,
  holdingId: string,
): Promise<InvestmentHoldingRow> {
  const [row] = await getDb()
    .select()
    .from(investmentHoldings)
    .where(
      and(
        eq(investmentHoldings.id, holdingId),
        eq(investmentHoldings.userId, userId),
        isNull(investmentHoldings.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Posição não encontrada");
  }

  return row;
}

export async function listInvestmentHoldings(
  userId: string,
  query: ListInvestmentHoldingsQuery,
): Promise<{ items: InvestmentHolding[] }> {
  const conditions = [
    eq(investmentHoldings.userId, userId),
    isNull(investmentHoldings.deletedAt),
  ];
  if (query.accountId) {
    conditions.push(eq(investmentHoldings.accountId, query.accountId));
  }

  const rows = await getDb()
    .select()
    .from(investmentHoldings)
    .where(and(...conditions))
    .orderBy(investmentHoldings.createdAt);

  return { items: rows.map(toInvestmentHolding) };
}

export async function getInvestmentHolding(
  userId: string,
  holdingId: string,
): Promise<InvestmentHolding> {
  const row = await getInvestmentHoldingRow(userId, holdingId);
  return toInvestmentHolding(row);
}

export async function createInvestmentHolding(
  userId: string,
  input: CreateInvestmentHoldingBody,
): Promise<InvestmentHolding> {
  await assertAccountBelongsToUser(userId, input.accountId);

  const incomeType = input.incomeType ?? "fixed_income";
  const isVariableIncome = incomeType === "variable_income";
  const pricingSource = isVariableIncome
    ? pricingSourceForAssetClass(input.assetClass as AssetClass)
    : "manual";
  const now = new Date();
  const id = newId();

  await getDb()
    .insert(investmentHoldings)
    .values({
      id,
      accountId: input.accountId,
      userId,
      symbol: input.symbol,
      incomeType,
      assetClass: isVariableIncome ? (input.assetClass ?? null) : null,
      quantity: isVariableIncome ? String(input.quantity) : "1",
      averageCostCents: isVariableIncome
        ? (input.averageCostCents ?? null)
        : null,
      currentUnitValueCents: input.currentUnitValueCents ?? 0,
      maturityDate: input.maturityDate ?? null,
      pricingSource,
      lastQuoteError:
        isVariableIncome &&
        pricingSource !== "manual" &&
        input.currentUnitValueCents === undefined
          ? "Cotação pendente"
          : null,
      notes: input.notes ?? null,
      lastValuationAt: now,
      createdAt: now,
      updatedAt: now,
    });

  return getInvestmentHolding(userId, id);
}

export async function updateInvestmentHolding(
  userId: string,
  holdingId: string,
  input: UpdateInvestmentHoldingBody,
): Promise<InvestmentHolding> {
  await getInvestmentHoldingRow(userId, holdingId);

  const updates: Partial<InvestmentHoldingRow> = { updatedAt: new Date() };
  if (input.symbol !== undefined) updates.symbol = input.symbol;
  if (input.maturityDate !== undefined) {
    updates.maturityDate = input.maturityDate;
  }
  if (input.notes !== undefined) updates.notes = input.notes;

  await getDb()
    .update(investmentHoldings)
    .set(updates)
    .where(eq(investmentHoldings.id, holdingId));

  return getInvestmentHolding(userId, holdingId);
}

export async function updateHoldingValuation(
  userId: string,
  holdingId: string,
  input: UpdateHoldingValuationBody,
): Promise<InvestmentHolding> {
  await getInvestmentHoldingRow(userId, holdingId);

  const now = new Date();
  await getDb()
    .update(investmentHoldings)
    .set({
      currentUnitValueCents: input.currentUnitValueCents,
      lastValuationAt: now,
      updatedAt: now,
    })
    .where(eq(investmentHoldings.id, holdingId));

  return getInvestmentHolding(userId, holdingId);
}

export async function updateHoldingQuoteMode(
  userId: string,
  holdingId: string,
  input: UpdateHoldingQuoteModeBody,
): Promise<InvestmentHolding> {
  const row = await getInvestmentHoldingRow(userId, holdingId);
  if (row.incomeType !== "variable_income") {
    throw new BadRequestError(
      "Alternância de cotação automática disponível apenas para renda variável",
    );
  }

  await getDb()
    .update(investmentHoldings)
    .set({ manualOverride: input.manualOverride, updatedAt: new Date() })
    .where(eq(investmentHoldings.id, holdingId));

  return getInvestmentHolding(userId, holdingId);
}

export async function refreshHoldingQuoteById(
  userId: string,
  holdingId: string,
): Promise<InvestmentHolding> {
  const row = await getInvestmentHoldingRow(userId, holdingId);
  const refreshed = await refreshHoldingQuote(row, "on-demand");
  return toInvestmentHolding(refreshed);
}

export async function deleteInvestmentHolding(
  userId: string,
  holdingId: string,
): Promise<void> {
  await getInvestmentHoldingRow(userId, holdingId);
  const now = new Date();

  await getDb()
    .update(investmentHoldings)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(investmentHoldings.id, holdingId));
}
