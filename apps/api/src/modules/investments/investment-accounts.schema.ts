import { z } from "zod";
import {
  INVESTMENT_ACCOUNT_TYPES,
  type InvestmentAccountType,
} from "@money-manager/types";

const investmentAccountTypeSchema = z.enum(
  INVESTMENT_ACCOUNT_TYPES as unknown as [
    InvestmentAccountType,
    ...InvestmentAccountType[],
  ],
);

export const createInvestmentAccountBodySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para a conta"),
  type: investmentAccountTypeSchema,
  institution: z.string().trim().min(1).optional(),
});

export type CreateInvestmentAccountBody = z.infer<
  typeof createInvestmentAccountBodySchema
>;

export const updateInvestmentAccountBodySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para a conta").optional(),
  type: investmentAccountTypeSchema.optional(),
  institution: z.string().trim().min(1).nullable().optional(),
});

export type UpdateInvestmentAccountBody = z.infer<
  typeof updateInvestmentAccountBodySchema
>;

export const investmentAccountIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type InvestmentAccountIdParams = z.infer<
  typeof investmentAccountIdParamsSchema
>;
