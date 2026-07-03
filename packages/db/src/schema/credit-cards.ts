import {
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  char,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const creditCards = pgTable(
  "credit_cards",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastFour: char("last_four", { length: 4 }).notNull(),
    dueDay: smallint("due_day").notNull(),
    closingDay: smallint("closing_day").notNull(),
    closingOffsetDays: smallint("closing_offset_days").notNull().default(7),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("credit_cards_user_id_idx").on(t.userId),
    index("credit_cards_user_deleted_idx").on(t.userId, t.deletedAt),
  ],
);
