import {
  bigint,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const piggyBankStatusEnum = pgEnum("piggy_bank_status", [
  "active",
  "completed",
]);

export const piggyBankTransactionTypeEnum = pgEnum(
  "piggy_bank_transaction_type",
  ["deposit", "withdrawal"],
);

export const piggyBanks = pgTable(
  "piggy_banks",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    currentAmountCents: bigint("current_amount_cents", { mode: "number" })
      .notNull()
      .default(0),
    targetAmountCents: bigint("target_amount_cents", { mode: "number" }),
    goalDescription: text("goal_description"),
    targetDate: date("target_date"),
    status: piggyBankStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("piggy_banks_user_id_idx").on(t.userId)],
);

export const piggyBankTransactions = pgTable(
  "piggy_bank_transactions",
  {
    id: uuid("id").primaryKey(),
    piggyBankId: uuid("piggy_bank_id")
      .notNull()
      .references(() => piggyBanks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: piggyBankTransactionTypeEnum("type").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("piggy_bank_transactions_piggy_bank_id_idx").on(t.piggyBankId),
    index("piggy_bank_transactions_user_id_idx").on(t.userId),
  ],
);
