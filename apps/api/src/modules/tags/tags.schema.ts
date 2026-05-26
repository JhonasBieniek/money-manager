import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateTagSchema = createTagSchema.partial();

export const tagIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listTagsQuerySchema = z.object({
  parentId: z
    .union([z.literal("root"), z.string().uuid()])
    .optional(),
});

export type CreateTagBody = z.infer<typeof createTagSchema>;
export type UpdateTagBody = z.infer<typeof updateTagSchema>;
export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;
