import { z } from "zod";

const goalCategorySchema = z.enum([
  "liberdade-financeira",
  "custos-fixos",
  "conforto",
  "metas",
  "prazeres",
  "conhecimento",
]);

export const upsertGoalsBodySchema = z.object({
  goals: z
    .array(
      z.object({
        category: goalCategorySchema,
        percentage: z.number().min(0).max(100),
      }),
    )
    .length(6),
});

export const goalUsageQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export type UpsertGoalsBody = z.infer<typeof upsertGoalsBodySchema>;
export type GoalUsageQuery = z.infer<typeof goalUsageQuerySchema>;
