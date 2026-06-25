import { z } from "zod";
import { uuidArrayQueryParam } from "../../shared/schemas/query-params.js";

const monthYearRefine = <T extends { month?: number; year?: number }>(
  data: T,
) => {
  const hasMonth = data.month !== undefined;
  const hasYear = data.year !== undefined;
  return hasMonth === hasYear;
};

export const listIncomesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    startDate: z.string().datetime({ offset: true }).optional(),
    endDate: z.string().datetime({ offset: true }).optional(),
    description: z.string().trim().min(1).optional(),
    tagIds: uuidArrayQueryParam(),
  })
  .refine(monthYearRefine, {
    message: "month e year devem ser informados juntos",
  });

export type ListIncomesQuery = z.infer<typeof listIncomesQuerySchema>;

export const createIncomeBodySchema = z.object({
  amount: z.number().positive("O valor deve ser maior que zero"),
  description: z.string().trim().min(1).max(500),
  source: z
    .enum(["salary", "freelance", "investment", "gift", "other"])
    .optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export type CreateIncomeBody = z.infer<typeof createIncomeBodySchema>;

export const updateIncomeBodySchema = createIncomeBodySchema.partial();

export type UpdateIncomeBody = z.infer<typeof updateIncomeBodySchema>;

export const incomeIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type IncomeIdParams = z.infer<typeof incomeIdParamsSchema>;
