import { z } from "zod";

export const createTagBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser um hex válido (#RRGGBB)")
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export type CreateTagBody = z.infer<typeof createTagBodySchema>;

export const updateTagBodySchema = createTagBodySchema.partial();

export type UpdateTagBody = z.infer<typeof updateTagBodySchema>;

export const tagIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type TagIdParams = z.infer<typeof tagIdParamsSchema>;

export const listTagsQuerySchema = z.object({
  parentId: z.union([z.literal("root"), z.string().uuid()]).optional(),
});

export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;
