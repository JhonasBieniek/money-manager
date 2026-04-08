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
import { categories } from "./categories.js";
import {
  expenseSourceEnum,
  ocrStatusEnum,
  paymentMethodEnum,
} from "./enums.js";
import { users } from "./users.js";

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    establishment: text("establishment"),
    paymentMethod: paymentMethodEnum("payment_method")
      .notNull()
      .default("credit_card"),
    cardLastFour: char("card_last_four", { length: 4 }),
    source: expenseSourceEnum("source").notNull().default("manual"),
    ocrStatus: ocrStatusEnum("ocr_status"),
    idempotencyKey: text("idempotency_key"),
    ocrRaw: jsonb("ocr_raw").$type<unknown>(),
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
    index("expenses_user_category_idx").on(t.userId, t.categoryId),
    index("expenses_user_deleted_idx").on(t.userId, t.deletedAt),
    uniqueIndex("expenses_idempotency_key_uidx").on(t.idempotencyKey),
  ]
);
