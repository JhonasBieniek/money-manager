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
  kind: z.enum(["voice", "audio", "photo"]),
  fileId: z.string().min(1).optional(),
  messageAt: z.string().datetime(),
});

export const patchInboundMessageSchema = z.object({
  transcription: z.string().optional(),
  parsedItems: z.array(parsedExpenseItemSchema).optional(),
  status: z.enum(["pending", "synced", "failed", "partial"]).optional(),
  syncError: z.string().nullable().optional(),
  expenseIds: z.array(z.string().uuid()).optional(),
  syncedAt: z.string().datetime().nullable().optional(),
});

export const pendingMessagesQuerySchema = z.object({
  chatId: z.string().regex(/^\d+$/),
});

export const messageIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type RecordInboundMessageBody = z.infer<typeof recordInboundMessageSchema>;
export type PatchInboundMessageBody = z.infer<typeof patchInboundMessageSchema>;
