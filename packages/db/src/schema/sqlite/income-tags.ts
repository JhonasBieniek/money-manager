import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { incomes } from "./incomes.js";
import { tags } from "./tags.js";

export const incomeTags = sqliteTable(
  "income_tags",
  {
    incomeId: text("income_id")
      .notNull()
      .references(() => incomes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.incomeId, t.tagId] }),
    tagIdIdx: index("income_tags_tag_id_idx").on(t.tagId),
    incomeTagIdx: index("income_tags_income_tag_idx").on(t.incomeId, t.tagId),
  })
);

