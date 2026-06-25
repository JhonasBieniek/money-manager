import { afterAll, afterEach, beforeEach } from "@jest/globals";
import { closePool, getPool } from "@money-manager/db";

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export const describeWithDb = hasDatabase() ? describe : describe.skip;

export async function truncateTables(): Promise<void> {
  await getPool().query(
    "TRUNCATE TABLE income_tags, incomes, expense_tags, expenses, goals, tags, sessions, users RESTART IDENTITY CASCADE",
  );
}

export async function closeTestDb(): Promise<void> {
  await closePool();
}

export function useIntegrationDbLifecycle(): void {
  beforeEach(async () => {
    await truncateTables();
  });

  afterEach(async () => {
    await truncateTables();
  });

  afterAll(async () => {
    await closeTestDb();
  });
}
