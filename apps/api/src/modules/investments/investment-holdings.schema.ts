import { z } from "zod";

export const createInvestmentHoldingBodySchema = z.object({
  accountId: z.string().uuid(),
  symbol: z.string().trim().min(1, "Informe um nome para a posição"),
  currentUnitValueCents: z.number().int().min(0, "Valor inválido"),
  incomeType: z.enum(["fixed_income", "variable_income"]).optional(),
  maturityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().trim().min(1).optional(),
});

export type CreateInvestmentHoldingBody = z.infer<
  typeof createInvestmentHoldingBodySchema
>;

export const updateInvestmentHoldingBodySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Informe um nome para a posição")
    .optional(),
  maturityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().min(1).nullable().optional(),
});

export type UpdateInvestmentHoldingBody = z.infer<
  typeof updateInvestmentHoldingBodySchema
>;

export const updateHoldingValuationBodySchema = z.object({
  currentUnitValueCents: z.number().int().min(0, "Valor inválido"),
});

export type UpdateHoldingValuationBody = z.infer<
  typeof updateHoldingValuationBodySchema
>;

export const investmentHoldingIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type InvestmentHoldingIdParams = z.infer<
  typeof investmentHoldingIdParamsSchema
>;

export const listInvestmentHoldingsQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
});

export type ListInvestmentHoldingsQuery = z.infer<
  typeof listInvestmentHoldingsQuerySchema
>;
