import { z } from "zod";

export const listExpensesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
