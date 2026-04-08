import { z } from "zod";

export const internalLinkBodySchema = z.object({
  token: z.string().min(1),
  chatId: z.string().regex(/^\d+$/, "chatId must be a numeric string"),
  username: z.string().max(64).optional(),
});

export type InternalLinkBody = z.infer<typeof internalLinkBodySchema>;

export const internalAccountQuerySchema = z.object({
  chatId: z.string().regex(/^\d+$/),
});
