import {
  creditCards,
  debtInstallments,
  debts,
  expenses,
  getDb,
} from "@money-manager/db";
import type {
  Debt,
  DebtInstallment,
  DebtWithInstallments,
  InstallmentPeriod,
  PaymentMethod,
} from "@money-manager/types";
import { newId } from "@money-manager/utils";
import {
  calculateDebtEndDate,
  generateInstallmentDueDates,
  isDateInMonth,
  parseDateString,
  toDateString,
} from "@money-manager/utils/installment-schedule";
import { and, asc, eq, isNull } from "drizzle-orm";
import { BadRequestError, NotFoundError } from "../../shared/errors/app-error.js";
import { assignExpenseToStatement } from "../credit-cards/credit-cards.service.js";
import type { CreateDebtBody, UpdateDebtBody } from "./debts.schema.js";

const PAYMENT_METHOD_MAP: Record<number, PaymentMethod> = {
  0: "cash",
  1: "credit_card",
  2: "pix",
};

type DebtRow = typeof debts.$inferSelect;
type InstallmentRow = typeof debtInstallments.$inferSelect;

function toDebt(row: DebtRow, paidCents: number): Debt {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    installmentCount: row.installmentCount,
    installmentPeriod: row.installmentPeriod as InstallmentPeriod,
    installmentCents: row.installmentCents,
    totalCents: row.totalCents,
    autoSyncExpenses: row.autoSyncExpenses,
    paymentMethod: row.paymentMethod as PaymentMethod,
    creditCardId: row.creditCardId,
    startDate: row.startDate,
    endDate: row.endDate,
    remainingBalanceCents: row.remainingBalanceCents,
    paidCents,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toInstallment(row: InstallmentRow): DebtInstallment {
  return {
    id: row.id,
    debtId: row.debtId,
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    amountCents: row.amountCents,
    status: row.status,
    paidAt: row.paidAt?.toISOString() ?? null,
    expenseId: row.expenseId,
  };
}

function resolveAmounts(input: CreateDebtBody): {
  installmentCents: number;
  totalCents: number;
} {
  if (input.installmentAmount !== undefined && input.totalAmount !== undefined) {
    const installmentCents = Math.round(input.installmentAmount * 100);
    const totalCents = Math.round(input.totalAmount * 100);
    const expected = installmentCents * input.installmentCount;
    if (Math.abs(expected - totalCents) > 1) {
      throw new BadRequestError(
        "Valor total não corresponde a parcelas × valor da parcela",
      );
    }
    return { installmentCents, totalCents };
  }

  if (input.installmentAmount !== undefined) {
    const installmentCents = Math.round(input.installmentAmount * 100);
    return {
      installmentCents,
      totalCents: installmentCents * input.installmentCount,
    };
  }

  const totalCents = Math.round(input.totalAmount! * 100);
  const installmentCents = Math.round(totalCents / input.installmentCount);
  return { installmentCents, totalCents };
}

async function assertCreditCardBelongsToUser(
  userId: string,
  creditCardId: string,
): Promise<void> {
  const [card] = await getDb()
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, creditCardId),
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
      ),
    )
    .limit(1);

  if (!card) {
    throw new BadRequestError("Cartão de crédito inválido");
  }
}

function hasStructuralChanges(input: UpdateDebtBody): boolean {
  return (
    input.installmentCount !== undefined ||
    input.installmentPeriod !== undefined ||
    input.installmentAmount !== undefined ||
    input.totalAmount !== undefined ||
    input.startDate !== undefined
  );
}

export function resolveInstallmentCentsForUpdate(
  input: UpdateDebtBody,
  existing: DebtRow,
  paidCount: number,
  paidTotalCents: number,
  installmentCount: number,
): number {
  const pendingCount = installmentCount - paidCount;

  if (input.installmentAmount !== undefined) {
    return Math.round(input.installmentAmount * 100);
  }

  if (input.totalAmount !== undefined) {
    if (pendingCount === 0) {
      return existing.installmentCents;
    }
    const totalCents = Math.round(input.totalAmount * 100);
    return Math.round((totalCents - paidTotalCents) / pendingCount);
  }

  return existing.installmentCents;
}

async function getDebtRow(userId: string, debtId: string): Promise<DebtRow> {
  const [row] = await getDb()
    .select()
    .from(debts)
    .where(
      and(
        eq(debts.id, debtId),
        eq(debts.userId, userId),
        isNull(debts.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Dívida não encontrada");
  }

  return row;
}

async function sumPaidCents(debtId: string): Promise<number> {
  const rows = await getDb()
    .select({ amountCents: debtInstallments.amountCents })
    .from(debtInstallments)
    .where(
      and(
        eq(debtInstallments.debtId, debtId),
        eq(debtInstallments.status, "paid"),
      ),
    );
  return rows.reduce((acc, row) => acc + row.amountCents, 0);
}

async function refreshDebtBalance(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  debtId: string,
): Promise<void> {
  const [debt] = await tx
    .select()
    .from(debts)
    .where(eq(debts.id, debtId))
    .limit(1);
  if (!debt) {
    return;
  }

  const paidRows = await tx
    .select({ amountCents: debtInstallments.amountCents })
    .from(debtInstallments)
    .where(
      and(
        eq(debtInstallments.debtId, debtId),
        eq(debtInstallments.status, "paid"),
      ),
    );
  const paidCents = paidRows.reduce((acc, row) => acc + row.amountCents, 0);
  const remaining = Math.max(debt.totalCents - paidCents, 0);
  const now = new Date();

  await tx
    .update(debts)
    .set({
      remainingBalanceCents: remaining,
      status: remaining === 0 ? "paid_off" : "active",
      updatedAt: now,
    })
    .where(eq(debts.id, debtId));
}

async function createExpenseForInstallment(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  userId: string,
  debt: DebtRow,
  installment: InstallmentRow,
): Promise<string> {
  const expenseId = newId();
  const occurredAt = parseDateString(installment.dueDate);
  const paymentMethod = debt.paymentMethod as PaymentMethod;

  await tx.insert(expenses).values({
    id: expenseId,
    userId,
    goalCategory: "custos-fixos",
    amountCents: installment.amountCents,
    description: `Parcela ${installment.installmentNumber}/${debt.installmentCount} — ${debt.name}`,
    paymentMethod,
    creditCardId:
      paymentMethod === "credit_card" ? debt.creditCardId : null,
    source: "manual",
    occurredAt,
  });

  await assignExpenseToStatement(
    tx,
    userId,
    expenseId,
    paymentMethod,
    paymentMethod === "credit_card" ? debt.creditCardId : null,
    occurredAt,
  );

  return expenseId;
}

async function syncInstallmentsForMonth(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  userId: string,
  debt: DebtRow,
  year: number,
  month: number,
): Promise<void> {
  if (!debt.autoSyncExpenses || debt.status === "paid_off") {
    return;
  }

  const pending = await tx
    .select()
    .from(debtInstallments)
    .where(
      and(
        eq(debtInstallments.debtId, debt.id),
        eq(debtInstallments.status, "pending"),
        isNull(debtInstallments.expenseId),
      ),
    )
    .orderBy(asc(debtInstallments.installmentNumber));

  const now = new Date();
  for (const installment of pending) {
    const dueDate = parseDateString(installment.dueDate);
    if (!isDateInMonth(dueDate, year, month)) {
      continue;
    }

    const expenseId = await createExpenseForInstallment(
      tx,
      userId,
      debt,
      installment,
    );

    await tx
      .update(debtInstallments)
      .set({
        status: "paid",
        paidAt: now,
        expenseId,
        updatedAt: now,
      })
      .where(eq(debtInstallments.id, installment.id));
  }

  await refreshDebtBalance(tx, debt.id);
}

export async function syncUserDebtsForMonth(
  userId: string,
  year: number,
  month: number,
): Promise<void> {
  const activeDebts = await getDb()
    .select()
    .from(debts)
    .where(
      and(
        eq(debts.userId, userId),
        isNull(debts.deletedAt),
        eq(debts.autoSyncExpenses, true),
        eq(debts.status, "active"),
      ),
    );

  if (activeDebts.length === 0) {
    return;
  }

  await getDb().transaction(async (tx) => {
    for (const debt of activeDebts) {
      await syncInstallmentsForMonth(tx, userId, debt, year, month);
    }
  });
}

async function syncUserDebtsForCurrentMonth(userId: string): Promise<void> {
  const now = new Date();
  await syncUserDebtsForMonth(userId, now.getFullYear(), now.getMonth() + 1);
}

async function getDebtWithInstallments(
  userId: string,
  debtId: string,
): Promise<DebtWithInstallments | undefined> {
  const [row] = await getDb()
    .select()
    .from(debts)
    .where(
      and(
        eq(debts.id, debtId),
        eq(debts.userId, userId),
        isNull(debts.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return undefined;
  }

  const paidCents = await sumPaidCents(row.id);
  const installmentRows = await getDb()
    .select()
    .from(debtInstallments)
    .where(eq(debtInstallments.debtId, row.id))
    .orderBy(asc(debtInstallments.installmentNumber));

  return {
    ...toDebt(row, paidCents),
    installments: installmentRows.map(toInstallment),
  };
}

export async function listDebts(
  userId: string,
): Promise<{ items: DebtWithInstallments[] }> {
  await syncUserDebtsForCurrentMonth(userId);

  const rows = await getDb()
    .select()
    .from(debts)
    .where(and(eq(debts.userId, userId), isNull(debts.deletedAt)))
    .orderBy(asc(debts.createdAt));

  const items: DebtWithInstallments[] = [];
  for (const row of rows) {
    const paidCents = await sumPaidCents(row.id);
    const installmentRows = await getDb()
      .select()
      .from(debtInstallments)
      .where(eq(debtInstallments.debtId, row.id))
      .orderBy(asc(debtInstallments.installmentNumber));

    items.push({
      ...toDebt(row, paidCents),
      installments: installmentRows.map(toInstallment),
    });
  }

  return { items };
}

export async function createDebt(
  userId: string,
  input: CreateDebtBody,
): Promise<DebtWithInstallments> {
  const { installmentCents, totalCents } = resolveAmounts(input);
  const paymentMethod = PAYMENT_METHOD_MAP[input.paymentMethodIndex]!;
  const creditCardId =
    paymentMethod === "credit_card" ? (input.creditCardId ?? null) : null;

  if (paymentMethod === "credit_card" && creditCardId) {
    await assertCreditCardBelongsToUser(userId, creditCardId);
  }

  const startDate = input.startDate
    ? parseDateString(input.startDate)
    : new Date();
  const endDate = calculateDebtEndDate(
    startDate,
    input.installmentCount,
    input.installmentPeriod,
  );
  const dueDates = generateInstallmentDueDates(
    startDate,
    input.installmentCount,
    input.installmentPeriod,
  );
  const debtId = newId();
  const now = new Date();

  await getDb().transaction(async (tx) => {
    await tx.insert(debts).values({
      id: debtId,
      userId,
      name: input.name.trim(),
      installmentCount: input.installmentCount,
      installmentPeriod: input.installmentPeriod,
      installmentCents,
      totalCents,
      autoSyncExpenses: input.autoSyncExpenses,
      paymentMethod,
      creditCardId,
      startDate: toDateString(startDate),
      endDate: toDateString(endDate),
      remainingBalanceCents: totalCents,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(debtInstallments).values(
      dueDates.map((dueDate, index) => ({
        id: newId(),
        debtId,
        userId,
        installmentNumber: index + 1,
        dueDate: toDateString(dueDate),
        amountCents: installmentCents,
        status: "pending" as const,
        createdAt: now,
        updatedAt: now,
      })),
    );

    if (input.autoSyncExpenses) {
      const [debt] = await tx
        .select()
        .from(debts)
        .where(eq(debts.id, debtId))
        .limit(1);
      if (debt) {
        await syncInstallmentsForMonth(
          tx,
          userId,
          debt,
          now.getFullYear(),
          now.getMonth() + 1,
        );
      }
    }
  });

  const result = await listDebts(userId);
  const created = result.items.find((item) => item.id === debtId);
  if (!created) {
    throw new Error("Falha ao carregar dívida criada");
  }
  return created;
}

export async function updateDebt(
  userId: string,
  debtId: string,
  input: UpdateDebtBody,
): Promise<DebtWithInstallments> {
  const row = await getDebtRow(userId, debtId);

  const paymentMethod =
    input.paymentMethodIndex !== undefined
      ? PAYMENT_METHOD_MAP[input.paymentMethodIndex]!
      : (row.paymentMethod as PaymentMethod);
  const creditCardId =
    paymentMethod === "credit_card"
      ? (input.creditCardId ?? row.creditCardId)
      : null;

  if (paymentMethod === "credit_card" && creditCardId) {
    await assertCreditCardBelongsToUser(userId, creditCardId);
  }

  const now = new Date();
  const updates: Partial<DebtRow> = { updatedAt: now };

  if (input.name !== undefined) {
    updates.name = input.name.trim();
  }
  if (input.autoSyncExpenses !== undefined) {
    updates.autoSyncExpenses = input.autoSyncExpenses;
  }
  if (
    input.paymentMethodIndex !== undefined ||
    input.creditCardId !== undefined
  ) {
    updates.paymentMethod = paymentMethod;
    updates.creditCardId = creditCardId;
  }

  if (hasStructuralChanges(input)) {
    const installmentCount = input.installmentCount ?? row.installmentCount;
    const installmentPeriod = (input.installmentPeriod ??
      row.installmentPeriod) as InstallmentPeriod;
    const startDate = input.startDate
      ? parseDateString(input.startDate)
      : parseDateString(row.startDate);
    const endDate = calculateDebtEndDate(
      startDate,
      installmentCount,
      installmentPeriod,
    );
    const fullDueDates = generateInstallmentDueDates(
      startDate,
      installmentCount,
      installmentPeriod,
    );

    await getDb().transaction(async (tx) => {
      const paidRows = await tx
        .select({
          installmentNumber: debtInstallments.installmentNumber,
          amountCents: debtInstallments.amountCents,
        })
        .from(debtInstallments)
        .where(
          and(
            eq(debtInstallments.debtId, debtId),
            eq(debtInstallments.status, "paid"),
          ),
        );

      const paidCount = paidRows.length;
      const paidTotalCents = paidRows.reduce(
        (acc, r) => acc + r.amountCents,
        0,
      );
      const paidNumbers = new Set(paidRows.map((r) => r.installmentNumber));
      const maxPaidNumber = paidRows.reduce(
        (max, r) => Math.max(max, r.installmentNumber),
        0,
      );

      if (installmentCount < maxPaidNumber) {
        throw new BadRequestError(
          "A quantidade de parcelas não pode ser menor que as parcelas já pagas",
        );
      }

      const installmentCents = resolveInstallmentCentsForUpdate(
        input,
        row,
        paidCount,
        paidTotalCents,
        installmentCount,
      );
      const pendingCount = installmentCount - paidCount;
      const totalCents = paidTotalCents + installmentCents * pendingCount;

      await tx
        .delete(debtInstallments)
        .where(
          and(
            eq(debtInstallments.debtId, debtId),
            eq(debtInstallments.status, "pending"),
          ),
        );

      await tx
        .update(debts)
        .set({
          ...updates,
          installmentCount,
          installmentPeriod,
          installmentCents,
          totalCents,
          startDate: toDateString(startDate),
          endDate: toDateString(endDate),
        })
        .where(eq(debts.id, debtId));

      const pendingInserts: (typeof debtInstallments.$inferInsert)[] = [];
      for (let number = 1; number <= installmentCount; number++) {
        if (paidNumbers.has(number)) continue;
        pendingInserts.push({
          id: newId(),
          debtId,
          userId,
          installmentNumber: number,
          dueDate: toDateString(fullDueDates[number - 1]!),
          amountCents: installmentCents,
          status: "pending" as const,
          createdAt: now,
          updatedAt: now,
        });
      }
      if (pendingInserts.length > 0) {
        await tx.insert(debtInstallments).values(pendingInserts);
      }

      await refreshDebtBalance(tx, debtId);

      const autoSync = input.autoSyncExpenses ?? row.autoSyncExpenses;
      if (autoSync) {
        const [debt] = await tx
          .select()
          .from(debts)
          .where(eq(debts.id, debtId))
          .limit(1);
        if (debt) {
          await syncInstallmentsForMonth(
            tx,
            userId,
            debt,
            now.getFullYear(),
            now.getMonth() + 1,
          );
        }
      }
    });
  } else {
    await getDb().update(debts).set(updates).where(eq(debts.id, debtId));

    if (input.autoSyncExpenses === true && !row.autoSyncExpenses) {
      const [debt] = await getDb()
        .select()
        .from(debts)
        .where(eq(debts.id, debtId))
        .limit(1);
      if (debt) {
        await getDb().transaction(async (tx) => {
          await syncInstallmentsForMonth(
            tx,
            userId,
            debt,
            now.getFullYear(),
            now.getMonth() + 1,
          );
        });
      }
    }
  }

  const result = await listDebts(userId);
  const updated = result.items.find((item) => item.id === debtId);
  if (!updated) {
    throw new NotFoundError("Dívida não encontrada");
  }
  return updated;
}

export async function setInstallmentStatus(
  userId: string,
  debtId: string,
  installmentId: string,
  status: "paid" | "pending",
): Promise<DebtWithInstallments> {
  await getDebtRow(userId, debtId);

  const [installment] = await getDb()
    .select()
    .from(debtInstallments)
    .where(
      and(
        eq(debtInstallments.id, installmentId),
        eq(debtInstallments.debtId, debtId),
      ),
    )
    .limit(1);

  if (!installment) {
    throw new NotFoundError("Parcela não encontrada");
  }

  if (installment.status !== status) {
    const now = new Date();
    await getDb().transaction(async (tx) => {
      if (status === "paid") {
        await tx
          .update(debtInstallments)
          .set({ status: "paid", paidAt: now, updatedAt: now })
          .where(eq(debtInstallments.id, installmentId));
      } else {
        await tx
          .update(debtInstallments)
          .set({
            status: "pending",
            paidAt: null,
            expenseId: null,
            updatedAt: now,
          })
          .where(eq(debtInstallments.id, installmentId));
      }
      await refreshDebtBalance(tx, debtId);
    });
  }

  const updated = await getDebtWithInstallments(userId, debtId);
  if (!updated) {
    throw new NotFoundError("Dívida não encontrada");
  }
  return updated;
}

export async function deleteDebt(userId: string, debtId: string): Promise<void> {
  await getDebtRow(userId, debtId);

  await getDb()
    .update(debts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(debts.id, debtId));
}
