import { relations } from "drizzle-orm";
import { users } from "./schema/users.js";
import { sessions } from "./schema/sessions.js";
import { categories } from "./schema/categories.js";
import { expenses } from "./schema/expenses.js";
import { tags } from "./schema/tags.js";
import { expenseTags } from "./schema/expense-tags.js";
import { telegramAccounts, telegramLinkTokens } from "./schema/telegram-accounts.js";

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions:           many(sessions),
  categories:         many(categories),
  expenses:           many(expenses),
  tags:               many(tags),
  telegramAccount:    one(telegramAccounts, { fields: [users.id], references: [telegramAccounts.userId] }),
  telegramLinkTokens: many(telegramLinkTokens),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const telegramAccountsRelations = relations(telegramAccounts, ({ one }) => ({
  user: one(users, { fields: [telegramAccounts.userId], references: [users.id] }),
}));

export const telegramLinkTokensRelations = relations(telegramLinkTokens, ({ one }) => ({
  user: one(users, { fields: [telegramLinkTokens.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user:     one(users, { fields: [categories.userId], references: [users.id] }),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  user:        one(users,      { fields: [expenses.userId],     references: [users.id] }),
  category:    one(categories, { fields: [expenses.categoryId], references: [categories.id] }),
  expenseTags: many(expenseTags),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  user:        one(users, { fields: [tags.userId], references: [users.id] }),
  expenseTags: many(expenseTags),
}));

export const expenseTagsRelations = relations(expenseTags, ({ one }) => ({
  expense: one(expenses, { fields: [expenseTags.expenseId], references: [expenses.id] }),
  tag:     one(tags,     { fields: [expenseTags.tagId],     references: [tags.id] }),
}));