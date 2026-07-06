import { z } from "zod";

export const parsedExpenseItemSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().min(1).optional(),
  paymentMethod: z.enum(["cash", "credit_card", "pix"]).optional(),
});

export const recordInboundMessageSchema = z.object({
  chatId: z.string().regex(/^\d+$/),
  telegramMessageId: z.string().regex(/^\d+$/),
  telegramUpdateId: z.string().regex(/^\d+$/),
  kind: z.enum(["voice", "audio", "text"]),
  fileId: z.string().min(1).optional(),
  messageAt: z.string().datetime(),
  transcription: z.string().optional(),
});

export const patchInboundMessageSchema = z.object({
  transcription: z.string().optional(),
  parsedItems: z.array(parsedExpenseItemSchema).optional(),
  status: z.enum(["pending", "synced", "failed", "partial"]).optional(),
  syncError: z.string().nullable().optional(),
  expenseIds: z.array(z.string().uuid()).optional(),
  syncedAt: z.string().datetime().nullable().optional(),
  retryCount: z.number().int().min(0).optional(),
  nextRetryAt: z.string().datetime().nullable().optional(),
});

export const retryEligibleQuerySchema = z.object({
  maxAgeHours: z.coerce.number().int().min(1).max(168).default(24),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const pendingMessagesQuerySchema = z.object({
  chatId: z.string().regex(/^\d+$/),
});

export const messageIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type RecordInboundMessageBody = z.infer<typeof recordInboundMessageSchema>;
export type PatchInboundMessageBody = z.infer<typeof patchInboundMessageSchema>;
