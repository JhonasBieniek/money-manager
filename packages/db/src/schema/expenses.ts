import { sql } from "drizzle-orm";
import {
  char,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { expenseSourceEnum, paymentMethodEnum } from "./enums.js";
import { goalCategoryEnum } from "./goals.js";
import { users } from "./users.js";

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalCategory: goalCategoryEnum("goal_category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    paymentMethod: paymentMethodEnum("payment_method")
      .notNull()
      .default("cash"),
    cardLastFour: char("card_last_four", { length: 4 }),
    source: expenseSourceEnum("source").notNull().default("manual"),
    idempotencyKey: text("idempotency_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("expenses_user_id_idx").on(t.userId),
    index("expenses_user_occurred_idx").on(t.userId, t.occurredAt),
    index("expenses_user_goal_category_idx").on(t.userId, t.goalCategory),
    index("expenses_goal_category_idx").on(t.goalCategory),
    index("expenses_user_deleted_idx").on(t.userId, t.deletedAt),
    uniqueIndex("expenses_user_idempotency_uidx")
      .on(t.userId, t.idempotencyKey)
      .where(sql`"idempotency_key" IS NOT NULL AND "deleted_at" IS NULL`),
  ],
);
