import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { creditCards } from "./credit-cards.js";
import { paymentMethodEnum } from "./enums.js";
import { expenses } from "./expenses.js";
import { users } from "./users.js";

export const installmentPeriodEnum = pgEnum("installment_period", [
  "daily",
  "weekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "yearly",
]);

export const debtStatusEnum = pgEnum("debt_status", ["active", "paid_off"]);

export const debtInstallmentStatusEnum = pgEnum("debt_installment_status", [
  "pending",
  "paid",
]);

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    installmentCount: integer("installment_count").notNull(),
    installmentPeriod: installmentPeriodEnum("installment_period")
      .notNull()
      .default("monthly"),
    installmentCents: bigint("installment_cents", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    autoSyncExpenses: boolean("auto_sync_expenses").notNull().default(false),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    creditCardId: uuid("credit_card_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    remainingBalanceCents: bigint("remaining_balance_cents", {
      mode: "number",
    }).notNull(),
    status: debtStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("debts_user_id_idx").on(t.userId),
    index("debts_user_status_idx").on(t.userId, t.status),
  ],
);

export const debtInstallments = pgTable(
  "debt_installments",
  {
    id: uuid("id").primaryKey(),
    debtId: uuid("debt_id")
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installmentNumber: integer("installment_number").notNull(),
    dueDate: date("due_date").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: debtInstallmentStatusEnum("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expenseId: uuid("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("debt_installments_debt_id_idx").on(t.debtId),
    index("debt_installments_user_due_date_idx").on(t.userId, t.dueDate),
    uniqueIndex("debt_installments_debt_number_idx").on(
      t.debtId,
      t.installmentNumber,
    ),
  ],
);
