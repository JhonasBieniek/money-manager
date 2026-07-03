import { z } from "zod";

export const createCreditCardBodySchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório"),
  lastFour: z
    .string()
    .regex(/^\d{4}$/, "Informe exatamente 4 dígitos numéricos"),
  dueDay: z.number().int().min(1).max(31),
  closingOffsetDays: z.number().int().min(1).max(31).optional(),
});

export type CreateCreditCardBody = z.infer<typeof createCreditCardBodySchema>;

export const updateCreditCardBodySchema = createCreditCardBodySchema.partial();

export type UpdateCreditCardBody = z.infer<typeof updateCreditCardBodySchema>;

export const creditCardIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CreditCardIdParams = z.infer<typeof creditCardIdParamsSchema>;

export const statementIdParamsSchema = creditCardIdParamsSchema.extend({
  statementId: z.string().uuid(),
});

export type StatementIdParams = z.infer<typeof statementIdParamsSchema>;

const monthYearRefine = <T extends { month?: number; year?: number }>(
  data: T,
) => {
  const hasMonth = data.month !== undefined;
  const hasYear = data.year !== undefined;
  return hasMonth === hasYear;
};

export const listStatementsQuerySchema = z
  .object({
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine(monthYearRefine, {
    message: "month e year devem ser informados juntos",
  });

export type ListStatementsQuery = z.infer<typeof listStatementsQuerySchema>;

export const currentStatementsQuerySchema = z
  .object({
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine(monthYearRefine, {
    message: "month e year devem ser informados juntos",
  });

export type CurrentStatementsQuery = z.infer<
  typeof currentStatementsQuerySchema
>;

export const updateStatementBodySchema = z.object({
  status: z.enum(["open", "closed", "paid"]).optional(),
  adjustedTotalCents: z.number().int().nonnegative().nullable().optional(),
});

export type UpdateStatementBody = z.infer<typeof updateStatementBodySchema>;
