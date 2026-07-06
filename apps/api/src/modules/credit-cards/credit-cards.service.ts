import {
  creditCardStatements,
  creditCards,
  expenses,
  getDb,
} from "@money-manager/db";
import type {
  CreditCard,
  CreditCardStatement,
  CreditCardWithCurrentStatement,
  StatementStatus,
} from "@money-manager/types";
import {
  computeBillingCycle,
  computeNominalClosingDay,
  calendarDate,
  findBillingCycleForPurchase,
  findCurrentBillingCycle,
  isDateInPeriod,
  nextBillingCycle,
  parseDateString,
  toDateString,
} from "@money-manager/utils/billing-cycle";
import { newId } from "@money-manager/utils";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/app-error.js";
import type {
  CreateCreditCardBody,
  CurrentStatementsQuery,
  ListStatementsQuery,
  UpdateCreditCardBody,
  UpdateStatementBody,
} from "./credit-cards.schema.js";

type CardRow = typeof creditCards.$inferSelect;
type StatementRow = typeof creditCardStatements.$inferSelect;

function toCreditCard(row: CardRow): CreditCard {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    lastFour: row.lastFour,
    dueDay: row.dueDay,
    closingDay: row.closingDay,
    closingOffsetDays: row.closingOffsetDays,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toStatement(row: StatementRow): CreditCardStatement {
  return {
    id: row.id,
    creditCardId: row.creditCardId,
    userId: row.userId,
    cycleYear: row.cycleYear,
    cycleMonth: row.cycleMonth,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    dueDate: row.dueDate,
    calculatedTotalCents: Number(row.calculatedTotalCents),
    adjustedTotalCents:
      row.adjustedTotalCents === null ? null : Number(row.adjustedTotalCents),
    status: row.status as StatementStatus,
    closedAt: row.closedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getCardRow(
  userId: string,
  cardId: string,
): Promise<CardRow> {
  const [row] = await getDb()
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, cardId),
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Cartão não encontrado");
  }

  return row;
}

async function getStatementRow(
  userId: string,
  cardId: string,
  statementId: string,
): Promise<StatementRow> {
  const [row] = await getDb()
    .select()
    .from(creditCardStatements)
    .where(
      and(
        eq(creditCardStatements.id, statementId),
        eq(creditCardStatements.creditCardId, cardId),
        eq(creditCardStatements.userId, userId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Fatura não encontrada");
  }

  return row;
}

function todayCalendarDate(): Date {
  const now = new Date();
  return calendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Fecha faturas `open` cujo period_end já passou e abre o próximo ciclo. */
async function autoCloseExpiredOpenStatements(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  card: CardRow,
): Promise<void> {
  const today = todayCalendarDate();
  let guard = 0;

  while (guard++ < 24) {
    const [openStatement] = await tx
      .select()
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.creditCardId, card.id),
          eq(creditCardStatements.status, "open"),
        ),
      )
      .orderBy(
        asc(creditCardStatements.cycleYear),
        asc(creditCardStatements.cycleMonth),
      )
      .limit(1);

    if (!openStatement) {
      break;
    }

    const periodEnd = parseDateString(openStatement.periodEnd);
    if (periodEnd.getTime() >= today.getTime()) {
      break;
    }

    const now = new Date();
    await tx
      .update(creditCardStatements)
      .set({
        status: "closed",
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(creditCardStatements.id, openStatement.id));

    const next = nextBillingCycle(
      openStatement.cycleYear,
      openStatement.cycleMonth,
      card.dueDay,
      card.closingOffsetDays,
    );
    await getOrCreateStatementForCycle(
      tx,
      card,
      next.cycleYear,
      next.cycleMonth,
    );
  }
}

async function autoCloseExpiredOpenStatementsForUser(
  userId: string,
): Promise<void> {
  const cards = await getDb()
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)));

  if (cards.length === 0) {
    return;
  }

  await getDb().transaction(async (tx) => {
    for (const card of cards) {
      await autoCloseExpiredOpenStatements(tx, card);
    }
  });
}

async function insertStatement(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  card: CardRow,
  cycleYear: number,
  cycleMonth: number,
): Promise<StatementRow> {
  const cycle = computeBillingCycle(
    cycleYear,
    cycleMonth,
    card.dueDay,
    card.closingOffsetDays,
  );

  const id = newId();
  const [inserted] = await tx
    .insert(creditCardStatements)
    .values({
      id,
      creditCardId: card.id,
      userId: card.userId,
      cycleYear,
      cycleMonth,
      periodStart: toDateString(cycle.periodStart),
      periodEnd: toDateString(cycle.periodEnd),
      dueDate: toDateString(cycle.dueDate),
      calculatedTotalCents: 0,
      status: "open",
    })
    .returning();

  if (!inserted) {
    throw new Error("Falha ao criar fatura");
  }

  return inserted;
}

async function getOrCreateStatementForCycle(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  card: CardRow,
  cycleYear: number,
  cycleMonth: number,
): Promise<StatementRow> {
  const [existing] = await tx
    .select()
    .from(creditCardStatements)
    .where(
      and(
        eq(creditCardStatements.creditCardId, card.id),
        eq(creditCardStatements.cycleYear, cycleYear),
        eq(creditCardStatements.cycleMonth, cycleMonth),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  return insertStatement(tx, card, cycleYear, cycleMonth);
}

async function resolveTargetStatement(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  card: CardRow,
  naturalCycleYear: number,
  naturalCycleMonth: number,
): Promise<StatementRow> {
  let year = naturalCycleYear;
  let month = naturalCycleMonth;

  for (let attempt = 0; attempt < 24; attempt++) {
    const statement = await getOrCreateStatementForCycle(tx, card, year, month);
    if (statement.status === "open") {
      return statement;
    }

    const next = nextBillingCycle(year, month, card.dueDay, card.closingOffsetDays);
    year = next.cycleYear;
    month = next.cycleMonth;
  }

  throw new BadRequestError(
    "Não foi possível encontrar fatura aberta para alocar a despesa",
  );
}

async function findNextOpenStatementAfterCycle(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  card: CardRow,
  afterYear: number,
  afterMonth: number,
): Promise<StatementRow> {
  const next = nextBillingCycle(
    afterYear,
    afterMonth,
    card.dueDay,
    card.closingOffsetDays,
  );
  return resolveTargetStatement(
    tx,
    card,
    next.cycleYear,
    next.cycleMonth,
  );
}

export async function recalculateStatementTotal(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  statementId: string,
): Promise<void> {
  const [statement] = await tx
    .select()
    .from(creditCardStatements)
    .where(eq(creditCardStatements.id, statementId))
    .limit(1);

  const [sumRow] = await tx
    .select({
      total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.creditCardStatementId, statementId),
        isNull(expenses.deletedAt),
      ),
    );

  const newCalculatedTotalCents = Number(sumRow?.total ?? 0);
  const oldCalculatedTotalCents = Number(statement?.calculatedTotalCents ?? 0);
  const calculatedDelta = newCalculatedTotalCents - oldCalculatedTotalCents;

  const patch: Partial<typeof creditCardStatements.$inferInsert> = {
    calculatedTotalCents: newCalculatedTotalCents,
    updatedAt: new Date(),
  };

  if (
    statement?.adjustedTotalCents !== null &&
    statement?.adjustedTotalCents !== undefined
  ) {
    patch.adjustedTotalCents =
      Number(statement.adjustedTotalCents) + calculatedDelta;
  }

  await tx
    .update(creditCardStatements)
    .set(patch)
    .where(eq(creditCardStatements.id, statementId));
}

export async function assignExpenseToStatement(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  userId: string,
  expenseId: string,
  paymentMethod: string,
  creditCardId: string | null | undefined,
  occurredAt: Date,
  previousStatementId?: string | null,
): Promise<void> {
  if (paymentMethod !== "credit_card" || !creditCardId) {
    if (previousStatementId) {
      await tx
        .update(expenses)
        .set({
          creditCardId: null,
          creditCardStatementId: null,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, expenseId));
      await recalculateStatementTotal(tx, previousStatementId);
    }
    return;
  }

  const card = await getCardRow(userId, creditCardId);
  await autoCloseExpiredOpenStatements(tx, card);
  const naturalCycle = findBillingCycleForPurchase(
    occurredAt,
    card.dueDay,
    card.closingOffsetDays,
  );

  let target = await getOrCreateStatementForCycle(
    tx,
    card,
    naturalCycle.cycleYear,
    naturalCycle.cycleMonth,
  );

  if (target.status !== "open") {
    target = await findNextOpenStatementAfterCycle(
      tx,
      card,
      target.cycleYear,
      target.cycleMonth,
    );
  }

  await tx
    .update(expenses)
    .set({
      creditCardId: card.id,
      creditCardStatementId: target.id,
      cardLastFour: card.lastFour,
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, expenseId));

  const statementsToRecalc = new Set<string>([target.id]);
  if (previousStatementId && previousStatementId !== target.id) {
    statementsToRecalc.add(previousStatementId);
  }

  for (const statementId of statementsToRecalc) {
    await recalculateStatementTotal(tx, statementId);
  }
}

async function reopenStatement(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  card: CardRow,
  statement: StatementRow,
): Promise<void> {
  if (statement.status !== "closed") {
    throw new BadRequestError("Somente faturas fechadas podem ser reabertas");
  }

  const periodStart = parseDateString(statement.periodStart);
  const periodEnd = parseDateString(statement.periodEnd);

  const nextCycle = nextBillingCycle(
    statement.cycleYear,
    statement.cycleMonth,
    card.dueDay,
    card.closingOffsetDays,
  );

  const [nextStatement] = await tx
    .select()
    .from(creditCardStatements)
    .where(
      and(
        eq(creditCardStatements.creditCardId, card.id),
        eq(creditCardStatements.cycleYear, nextCycle.cycleYear),
        eq(creditCardStatements.cycleMonth, nextCycle.cycleMonth),
      ),
    )
    .limit(1);

  const affectedStatementIds = new Set<string>([statement.id]);

  if (nextStatement?.status === "open") {
    const candidates = await tx
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.creditCardStatementId, nextStatement.id),
          isNull(expenses.deletedAt),
        ),
      );

    for (const expense of candidates) {
      if (isDateInPeriod(expense.occurredAt, periodStart, periodEnd)) {
        await tx
          .update(expenses)
          .set({
            creditCardStatementId: statement.id,
            updatedAt: new Date(),
          })
          .where(eq(expenses.id, expense.id));
        affectedStatementIds.add(nextStatement.id);
      }
    }
  }

  await tx
    .update(creditCardStatements)
    .set({
      status: "open",
      closedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(creditCardStatements.id, statement.id));

  for (const statementId of affectedStatementIds) {
    await recalculateStatementTotal(tx, statementId);
  }
}

export async function listCreditCards(
  userId: string,
): Promise<{ items: CreditCard[] }> {
  const rows = await getDb()
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)))
    .orderBy(creditCards.name);

  return { items: rows.map(toCreditCard) };
}

export async function createCreditCard(
  userId: string,
  input: CreateCreditCardBody,
): Promise<CreditCard> {
  const offsetDays = input.closingOffsetDays ?? 7;
  const closingDay = computeNominalClosingDay(input.dueDay, offsetDays);
  const id = newId();
  const now = new Date();

  const row = await getDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(creditCards)
      .values({
        id,
        userId,
        name: input.name,
        lastFour: input.lastFour,
        dueDay: input.dueDay,
        closingDay,
        closingOffsetDays: offsetDays,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!inserted) {
      throw new Error("Falha ao criar cartão");
    }

    const currentCycle = findCurrentBillingCycle(
      now,
      inserted.dueDay,
      inserted.closingOffsetDays,
    );
    await insertStatement(
      tx,
      inserted,
      currentCycle.cycleYear,
      currentCycle.cycleMonth,
    );

    return inserted;
  });

  return toCreditCard(row);
}

export async function updateCreditCard(
  userId: string,
  cardId: string,
  input: UpdateCreditCardBody,
): Promise<CreditCard> {
  const existing = await getCardRow(userId, cardId);
  const dueDay = input.dueDay ?? existing.dueDay;
  const offsetDays = input.closingOffsetDays ?? existing.closingOffsetDays;
  const closingDay = computeNominalClosingDay(dueDay, offsetDays);

  const [updated] = await getDb()
    .update(creditCards)
    .set({
      name: input.name ?? existing.name,
      lastFour: input.lastFour ?? existing.lastFour,
      dueDay,
      closingOffsetDays: offsetDays,
      closingDay,
      updatedAt: new Date(),
    })
    .where(eq(creditCards.id, cardId))
    .returning();

  if (!updated) {
    throw new NotFoundError("Cartão não encontrado");
  }

  if (
    input.dueDay !== undefined ||
    input.closingOffsetDays !== undefined
  ) {
    await getDb().transaction(async (tx) => {
      const openStatements = await tx
        .select()
        .from(creditCardStatements)
        .where(
          and(
            eq(creditCardStatements.creditCardId, cardId),
            eq(creditCardStatements.status, "open"),
          ),
        );

      for (const statement of openStatements) {
        const cycle = computeBillingCycle(
          statement.cycleYear,
          statement.cycleMonth,
          dueDay,
          offsetDays,
        );
        await tx
          .update(creditCardStatements)
          .set({
            periodStart: toDateString(cycle.periodStart),
            periodEnd: toDateString(cycle.periodEnd),
            dueDate: toDateString(cycle.dueDate),
            updatedAt: new Date(),
          })
          .where(eq(creditCardStatements.id, statement.id));
      }
    });
  }

  return toCreditCard(updated);
}

export async function deleteCreditCard(
  userId: string,
  cardId: string,
): Promise<void> {
  await getCardRow(userId, cardId);

  const [openWithExpenses] = await getDb()
    .select({ id: creditCardStatements.id })
    .from(creditCardStatements)
    .innerJoin(
      expenses,
      eq(expenses.creditCardStatementId, creditCardStatements.id),
    )
    .where(
      and(
        eq(creditCardStatements.creditCardId, cardId),
        eq(creditCardStatements.status, "open"),
        isNull(expenses.deletedAt),
      ),
    )
    .limit(1);

  if (openWithExpenses) {
    throw new BadRequestError(
      "Não é possível excluir cartão com fatura aberta contendo despesas",
    );
  }

  const now = new Date();
  await getDb()
    .update(creditCards)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(creditCards.id, cardId));
}

export async function listStatements(
  userId: string,
  cardId: string,
  query: ListStatementsQuery,
): Promise<{ items: CreditCardStatement[] }> {
  const card = await getCardRow(userId, cardId);
  await getDb().transaction(async (tx) => {
    await autoCloseExpiredOpenStatements(tx, card);
  });

  const filters = [eq(creditCardStatements.creditCardId, cardId)];

  if (query.month !== undefined && query.year !== undefined) {
    filters.push(eq(creditCardStatements.cycleMonth, query.month));
    filters.push(eq(creditCardStatements.cycleYear, query.year));
  }

  const rows = await getDb()
    .select()
    .from(creditCardStatements)
    .where(and(...filters))
    .orderBy(
      desc(creditCardStatements.cycleYear),
      desc(creditCardStatements.cycleMonth),
    );

  return { items: rows.map(toStatement) };
}

export async function getCurrentStatements(
  userId: string,
  query: CurrentStatementsQuery,
): Promise<{ items: CreditCardWithCurrentStatement[] }> {
  await autoCloseExpiredOpenStatementsForUser(userId);

  const now = new Date();

  const cards = await getDb()
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)))
    .orderBy(creditCards.name);

  const items: CreditCardWithCurrentStatement[] = [];

  for (const card of cards) {
    const cycle =
      query.year !== undefined && query.month !== undefined
        ? { cycleYear: query.year, cycleMonth: query.month }
        : findCurrentBillingCycle(now, card.dueDay, card.closingOffsetDays);

    const [statement] = await getDb()
      .select()
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.creditCardId, card.id),
          eq(creditCardStatements.cycleYear, cycle.cycleYear),
          eq(creditCardStatements.cycleMonth, cycle.cycleMonth),
        ),
      )
      .limit(1);

    items.push({
      ...toCreditCard(card),
      currentStatement: statement ? toStatement(statement) : null,
    });
  }

  return { items };
}

export async function updateStatement(
  userId: string,
  cardId: string,
  statementId: string,
  input: UpdateStatementBody,
): Promise<CreditCardStatement> {
  const card = await getCardRow(userId, cardId);

  const row = await getDb().transaction(async (tx) => {
    await autoCloseExpiredOpenStatements(tx, card);
    const statement = await getStatementRow(userId, cardId, statementId);
    const patch: Partial<typeof creditCardStatements.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.adjustedTotalCents !== undefined) {
      patch.adjustedTotalCents = input.adjustedTotalCents;
    }

    if (input.status === "closed") {
      if (statement.status !== "open") {
        throw new BadRequestError("Somente faturas abertas podem ser fechadas");
      }
      patch.status = "closed";
      patch.closedAt = new Date();
    } else if (input.status === "open") {
      await reopenStatement(tx, card, statement);
      const [reopened] = await tx
        .select()
        .from(creditCardStatements)
        .where(eq(creditCardStatements.id, statementId))
        .limit(1);
      if (!reopened) {
        throw new NotFoundError("Fatura não encontrada");
      }
      if (input.adjustedTotalCents !== undefined) {
        await tx
          .update(creditCardStatements)
          .set({
            adjustedTotalCents: input.adjustedTotalCents,
            updatedAt: new Date(),
          })
          .where(eq(creditCardStatements.id, statementId));
      }
      return (
        await tx
          .select()
          .from(creditCardStatements)
          .where(eq(creditCardStatements.id, statementId))
          .limit(1)
      )[0]!;
    } else if (input.status === "paid") {
      if (statement.status !== "closed") {
        throw new BadRequestError(
          "Somente faturas fechadas podem ser marcadas como pagas",
        );
      }
      patch.status = "paid";
      patch.paidAt = new Date();

      const next = nextBillingCycle(
        statement.cycleYear,
        statement.cycleMonth,
        card.dueDay,
        card.closingOffsetDays,
      );
      await getOrCreateStatementForCycle(
        tx,
        card,
        next.cycleYear,
        next.cycleMonth,
      );
    }

    if (input.status === "closed" || input.status === "paid") {
      const [updated] = await tx
        .update(creditCardStatements)
        .set(patch)
        .where(eq(creditCardStatements.id, statementId))
        .returning();
      return updated;
    }

    if (input.adjustedTotalCents !== undefined && !input.status) {
      const [updated] = await tx
        .update(creditCardStatements)
        .set(patch)
        .where(eq(creditCardStatements.id, statementId))
        .returning();
      return updated;
    }

    return statement;
  });

  if (!row) {
    throw new NotFoundError("Fatura não encontrada");
  }

  return toStatement(row);
}
