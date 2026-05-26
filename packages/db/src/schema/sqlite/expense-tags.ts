import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { expenses } from "./expenses.js";
import { tags } from "./tags.js";

export const expenseTags = sqliteTable(
  "expense_tags",
  {
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.expenseId, t.tagId] }),
    tagIdIdx: index("expense_tags_tag_id_idx").on(t.tagId),
    tagExpenseIdx: index("expense_tags_tag_expense_idx").on(t.tagId, t.expenseId),
  })
);

