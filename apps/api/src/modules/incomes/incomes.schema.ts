import { z } from "zod";

export const createIncomeSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  source: z
    .enum(["salary", "freelance", "investment", "gift", "other"])
    .optional(),
  occurredAt: z.string().datetime().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export const listIncomesQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  description: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export const incomeIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const updateIncomeSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().min(1).max(500).optional(),
  source: z
    .enum(["salary", "freelance", "investment", "gift", "other"])
    .optional(),
  occurredAt: z.string().datetime().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export type CreateIncomeBody = z.infer<typeof createIncomeSchema>;
export type ListIncomesQuery = z.infer<typeof listIncomesQuerySchema>;
export type UpdateIncomeBody = z.infer<typeof updateIncomeSchema>;
export type IncomeIdParams = z.infer<typeof incomeIdParamsSchema>;
