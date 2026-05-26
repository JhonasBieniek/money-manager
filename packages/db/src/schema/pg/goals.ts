import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const goalCategories = [
  "liberdade-financeira",
  "custos-fixos",
  "conforto",
  "metas",
  "prazeres",
  "conhecimento",
] as const;

export const goalCategoryEnum = pgEnum("goal_category", goalCategories);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey(),
    category: goalCategoryEnum("category").notNull(),
    percentage: text("percentage").notNull(), // cross-dialect: store as string (e.g. "12.34")
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("goals_category_idx").on(t.category),
    index("goals_active_idx").on(t.isActive),
  ]
);

