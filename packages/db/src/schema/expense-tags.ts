import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { expenses } from "./expenses.js";
import { tags } from "./tags.js";

export const expenseTags = pgTable(
  "expense_tags",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.expenseId, table.tagId] }),
  })
);
