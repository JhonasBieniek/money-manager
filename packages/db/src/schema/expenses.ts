import {
  char,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { categories } from "./categories.js";
import { users } from "./users.js";

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => categories.id),
  amountCents: integer("amount_cents").notNull(),
  description: text("description"),
  establishment: text("establishment"),
  paymentMethod: text("payment_method"),
  cardLastFour: char("card_last_four", { length: 4 }),
  source: text("source"),
  idempotencyKey: text("idempotency_key").unique(),
  ocrRaw: jsonb("ocr_raw").$type<unknown>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
