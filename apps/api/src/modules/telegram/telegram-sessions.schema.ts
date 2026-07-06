import { z } from "zod";
import type { DraftExpenseItem, SessionItemMeta } from "@money-manager/db";
import {
  GOAL_CATEGORIES,
  type GoalCategory,
  type ExpenseSource,
} from "@money-manager/types";

export const telegramBotPendingActionSchema = z.enum([
  "categorize",
  "payment_method",
  "credit_card",
  "tags",
  "none",
]);

export const sessionItemMetaSchema = z.object({
  paymentMethod: z.enum(["pix", "credit_card", "cash"]),
  goalCategoryResolved: z.boolean(),
  paymentMethodResolved: z.boolean(),
  creditCardResolved: z.boolean(),
  tagsResolved: z.boolean(),
});

const goalCategorySchema = z
  .enum(GOAL_CATEGORIES as [GoalCategory, ...GoalCategory[]])
  .nullable();

export const draftExpenseItemSchema = z.object({
  amountCents: z.number().int().positive(),
  description: z.string().trim().min(1),
  goalCategory: goalCategorySchema,
  paymentMethod: z.enum(["pix", "credit_card", "cash"]),
  creditCardId: z.string().uuid().nullable(),
  tagIds: z.array(z.string().uuid()),
  occurredAt: z.string().datetime({ offset: true }),
  source: z.enum(["telegram_whisper", "telegram_manual"] as [
    ExpenseSource,
    ExpenseSource,
  ]),
});

export const createBotSessionBodySchema = z.object({
  chatId: z.string().regex(/^\d+$/),
  triggerMessageId: z.string().regex(/^\d+$/).optional(),
  expenseIds: z.array(z.string().uuid()).default([]),
  draftItems: z.array(draftExpenseItemSchema).min(1),
  pendingAction: telegramBotPendingActionSchema,
  pendingItemIndex: z.number().int().min(0).optional(),
  itemMeta: z.array(sessionItemMetaSchema),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const patchBotSessionBodySchema = z.object({
  confirmationMessageId: z.string().regex(/^\d+$/).nullable().optional(),
  expenseIds: z.array(z.string().uuid()).optional(),
  draftItems: z.array(draftExpenseItemSchema).optional(),
  pendingAction: telegramBotPendingActionSchema.optional(),
  pendingItemIndex: z.number().int().min(0).optional(),
  itemMeta: z.array(sessionItemMetaSchema).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const chatIdParamsSchema = z.object({
  chatId: z.string().regex(/^\d+$/),
});

export const sessionIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreateBotSessionBody = z.infer<typeof createBotSessionBodySchema>;
export type PatchBotSessionBody = z.infer<typeof patchBotSessionBodySchema>;

export type { DraftExpenseItem, SessionItemMeta };
