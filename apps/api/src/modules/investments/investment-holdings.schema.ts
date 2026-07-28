import { z } from "zod";
import { ASSET_CLASSES } from "@money-manager/types";

export const createInvestmentHoldingBodySchema = z
  .object({
    accountId: z.string().uuid(),
    symbol: z.string().trim().min(1, "Informe um nome para a posição"),
    incomeType: z.enum(["fixed_income", "variable_income"]).optional(),
    currentUnitValueCents: z
      .number()
      .int()
      .min(0, "Valor inválido")
      .optional(),
    assetClass: z.enum(ASSET_CLASSES).optional(),
    quantity: z.number().positive("Quantidade inválida").optional(),
    averageCostCents: z
      .number()
      .int()
      .min(0, "Valor inválido")
      .nullable()
      .optional(),
    maturityDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    notes: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const incomeType = data.incomeType ?? "fixed_income";
    if (incomeType === "fixed_income") {
      if (data.currentUnitValueCents === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["currentUnitValueCents"],
          message: "Informe o valor atual",
        });
      }
    } else {
      if (data.assetClass === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assetClass"],
          message: "Informe a classe do ativo",
        });
      }
      if (data.quantity === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["quantity"],
          message: "Informe a quantidade",
        });
      }
    }
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

export const updateHoldingQuoteModeBodySchema = z.object({
  manualOverride: z.boolean(),
});

export type UpdateHoldingQuoteModeBody = z.infer<
  typeof updateHoldingQuoteModeBodySchema
>;
