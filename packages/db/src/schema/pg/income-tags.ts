import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { incomes } from "./incomes.js";
import { tags } from "./tags.js";

export const incomeTags = pgTable(
  "income_tags",
  {
    incomeId: uuid("income_id")
      .notNull()
      .references(() => incomes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.incomeId, t.tagId] }),
    tagIdIdx: index("income_tags_tag_id_idx").on(t.tagId),
    incomeTagIdx: index("income_tags_income_tag_idx").on(t.incomeId, t.tagId),
  })
);

