import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { statementStatusEnum } from "./enums.js";
import { creditCards } from "./credit-cards.js";
import { users } from "./users.js";

export const creditCardStatements = pgTable(
  "credit_card_statements",
  {
    id: uuid("id").primaryKey(),
    creditCardId: uuid("credit_card_id")
      .notNull()
      .references(() => creditCards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cycleYear: integer("cycle_year").notNull(),
    cycleMonth: integer("cycle_month").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueDate: date("due_date").notNull(),
    calculatedTotalCents: bigint("calculated_total_cents", { mode: "number" })
      .notNull()
      .default(0),
    adjustedTotalCents: bigint("adjusted_total_cents", { mode: "number" }),
    status: statementStatusEnum("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_card_statements_card_cycle_uidx").on(
      t.creditCardId,
      t.cycleYear,
      t.cycleMonth,
    ),
    index("credit_card_statements_card_status_idx").on(
      t.creditCardId,
      t.status,
    ),
    index("credit_card_statements_user_id_idx").on(t.userId),
  ],
);
