import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { expenses } from "./expenses.js";
import { tags } from "./tags.js";

export const expenseTags = pgTable(
  "expense_tags",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.tagId] }),
    index("expense_tags_tag_id_idx").on(t.tagId),
    index("expense_tags_tag_expense_idx").on(t.tagId, t.expenseId),
  ]
);
