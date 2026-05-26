import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/** Comparação case-insensitive (Postgres + SQLite). */
export function ciEqual(column: AnyColumn, value: string): SQL {
  return sql`lower(${column}) = lower(${value})`;
}

/** LIKE case-insensitive (Postgres + SQLite). */
export function ciLike(column: AnyColumn, pattern: string): SQL {
  return sql`lower(${column}) like lower(${pattern})`;
}
