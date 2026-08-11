import { creditCardStatements, expenses } from "@money-manager/db";
import { and, gte, isNull, lte, or, sql, type SQL } from "drizzle-orm";

/**
 * Regra de competência do orçamento (dashboard/metas):
 * um gasto de um mês é contabilizado sempre no mês seguinte.
 *
 * - Despesas que NÃO são de cartão (pix, dinheiro, etc.) contam no mês
 *   seguinte ao da data do gasto. Portanto, para exibir o mês (year, month)
 *   usamos as despesas ocorridas no mês anterior.
 * - Despesas de cartão seguem o ciclo da fatura (vencimento), que já cai no
 *   mês seguinte por natureza — são somadas pelo mês de vencimento da fatura,
 *   exatamente como o total de faturas exibido no dashboard.
 */

export function previousMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/** Intervalo [início, fim] do mês em horário local, inclusivo. */
export function monthDateRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Condição SQL das despesas contabilizadas no mês de competência (year, month).
 * Deve ser combinada com `eq(expenses.userId, userId)` e
 * `isNull(expenses.deletedAt)` no `and(...)` que a envolve.
 */
export function budgetMonthExpenseCondition(
  userId: string,
  year: number,
  month: number,
): SQL {
  const prev = previousMonth(year, month);
  const { start, end } = monthDateRange(prev.year, prev.month);

  return or(
    and(
      isNull(expenses.creditCardStatementId),
      gte(expenses.occurredAt, start),
      lte(expenses.occurredAt, end),
    ),
    sql`${expenses.creditCardStatementId} in (select ${creditCardStatements.id} from ${creditCardStatements} where ${creditCardStatements.userId} = ${userId} and ${creditCardStatements.cycleYear} = ${year} and ${creditCardStatements.cycleMonth} = ${month})`,
  )!;
}
