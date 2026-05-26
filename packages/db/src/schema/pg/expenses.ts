import {
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { expenseSourceEnum, ocrStatusEnum, paymentMethodEnum } from "./enums.js";
import { goalCategoryEnum } from "./goals.js";

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    goalCategory: goalCategoryEnum("goal_category").notNull().default("custos-fixos"),
    establishment: text("establishment"),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("credit_card"),
    cardLastFour: char("card_last_four", { length: 4 }),
    source: expenseSourceEnum("source").notNull().default("manual"),
    ocrStatus: ocrStatusEnum("ocr_status"),
    idempotencyKey: text("idempotency_key"),
    ocrRaw: jsonb("ocr_raw").$type<unknown>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("expenses_occurred_idx").on(t.occurredAt),
    index("expenses_goal_category_idx").on(t.goalCategory),
    index("expenses_deleted_idx").on(t.deletedAt),
    uniqueIndex("expenses_idempotency_key_uidx").on(t.idempotencyKey),
  ]
);

