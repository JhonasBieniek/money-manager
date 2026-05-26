import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const goalCategories = [
  "liberdade-financeira",
  "custos-fixos",
  "conforto",
  "metas",
  "prazeres",
  "conhecimento",
] as const;

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    category: text("category", { enum: goalCategories }).notNull(),
    percentage: text("percentage").notNull(), // string "12.34"
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    categoryIdx: index("goals_category_idx").on(t.category),
    activeIdx: index("goals_active_idx").on(t.isActive),
  })
);

