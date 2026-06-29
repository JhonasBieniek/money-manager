import { z } from "zod";

export const internalLinkBodySchema = z.object({
  token: z.string().min(1),
  chatId: z.string().min(1),
  username: z.string().optional(),
});

export const internalAccountQuerySchema = z.object({
  chatId: z.string().min(1),
});
