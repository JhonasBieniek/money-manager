import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const incomes = pgTable(
  "incomes",
  {
    id: uuid("id").primaryKey(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    source: text("source").notNull().default("other"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("incomes_occurred_idx").on(t.occurredAt),
    index("incomes_deleted_idx").on(t.deletedAt),
  ]
);

