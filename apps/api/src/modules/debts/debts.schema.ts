import { z } from "zod";
import {
  INSTALLMENT_PERIODS,
  type InstallmentPeriod,
} from "@money-manager/types";

const installmentPeriodSchema = z.enum(
  INSTALLMENT_PERIODS as unknown as [
    InstallmentPeriod,
    ...InstallmentPeriod[],
  ],
);

export const createDebtBodySchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome para a dívida"),
    installmentCount: z.number().int().min(1).max(9999),
    installmentPeriod: installmentPeriodSchema.default("monthly"),
    installmentAmount: z.number().positive("Valor da parcela inválido").optional(),
    totalAmount: z.number().positive("Valor total inválido").optional(),
    autoSyncExpenses: z.boolean().default(false),
    paymentMethodIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
    creditCardId: z.string().uuid().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (data) => data.installmentAmount !== undefined || data.totalAmount !== undefined,
    { message: "Informe o valor da parcela ou o valor total" },
  )
  .superRefine((data, ctx) => {
    if (data.paymentMethodIndex === 1 && !data.creditCardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione um cartão de crédito",
        path: ["creditCardId"],
      });
    }
  });

export type CreateDebtBody = z.infer<typeof createDebtBodySchema>;

export const updateDebtBodySchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome para a dívida").optional(),
    installmentCount: z.number().int().min(1).max(9999).optional(),
    installmentPeriod: installmentPeriodSchema.optional(),
    installmentAmount: z.number().positive("Valor da parcela inválido").optional(),
    totalAmount: z.number().positive("Valor total inválido").optional(),
    autoSyncExpenses: z.boolean().optional(),
    paymentMethodIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    creditCardId: z.string().uuid().nullable().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMethodIndex === 1 && !data.creditCardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione um cartão de crédito",
        path: ["creditCardId"],
      });
    }
  });

export type UpdateDebtBody = z.infer<typeof updateDebtBodySchema>;

export const debtIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type DebtIdParams = z.infer<typeof debtIdParamsSchema>;
