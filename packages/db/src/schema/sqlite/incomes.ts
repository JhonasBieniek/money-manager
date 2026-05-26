import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const incomes = sqliteTable(
  "incomes",
  {
    id: text("id").primaryKey(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    source: text("source").notNull().default("other"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    occurredIdx: index("incomes_occurred_idx").on(t.occurredAt),
    deletedIdx: index("incomes_deleted_idx").on(t.deletedAt),
  })
);

