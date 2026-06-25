import {
  boolean,
  decimal,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const goalCategories = [
  "liberdade-financeira",
  "custos-fixos",
  "conforto",
  "metas",
  "prazeres",
  "conhecimento",
] as const;

export type GoalCategory = (typeof goalCategories)[number];

export const goalCategoryEnum = pgEnum("goal_category", [...goalCategories]);

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: goalCategoryEnum("category").notNull(),
    percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("goals_user_id_idx").on(t.userId),
    index("goals_user_category_idx").on(t.userId, t.category),
  ],
);
