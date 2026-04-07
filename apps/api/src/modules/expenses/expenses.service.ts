import type { ListExpensesQuery } from "./expenses.schema.js";

export async function listExpenses(
  _userId: string,
  _query: ListExpensesQuery
): Promise<{ items: unknown[] }> {
  return { items: [] };
}
