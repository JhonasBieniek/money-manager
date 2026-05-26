import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { expenseSourceValues, ocrStatusValues, paymentMethodValues } from "./enums.js";
import { goalCategories } from "./goals.js";

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    goalCategory: text("goal_category", { enum: goalCategories }),
    establishment: text("establishment"),
    paymentMethod: text("payment_method", { enum: paymentMethodValues })
      .notNull()
      .default("credit_card"),
    source: text("source", { enum: expenseSourceValues }).notNull().default("manual"),
    ocrStatus: text("ocr_status", { enum: ocrStatusValues }),
    idempotencyKey: text("idempotency_key"),
    ocrRaw: text("ocr_raw"), // JSON string
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    occurredIdx: index("expenses_occurred_idx").on(t.occurredAt),
    goalCategoryIdx: index("expenses_goal_category_idx").on(t.goalCategory),
    deletedIdx: index("expenses_deleted_idx").on(t.deletedAt),
    idempotencyUidx: uniqueIndex("expenses_idempotency_key_uidx").on(t.idempotencyKey),
  })
);

