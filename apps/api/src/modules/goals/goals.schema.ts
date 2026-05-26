import { z } from "zod";

const goalCategorySchema = z.enum([
  "liberdade-financeira",
  "custos-fixos",
  "conforto",
  "metas",
  "prazeres",
  "conhecimento",
]);

export const upsertGoalsSchema = z.object({
  goals: z
    .array(
      z.object({
        category: goalCategorySchema,
        percentage: z.number().min(0).max(100),
      })
    )
    .min(6)
    .max(6),
});

export const listGoalsQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type UpsertGoalsBody = z.infer<typeof upsertGoalsSchema>;
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
export type GoalCategory = z.infer<typeof goalCategorySchema>;
