import { z } from "zod";

export const createPiggyBankBodySchema = z.object({
  name: z.string().trim().min(1, "Informe um nome para o cofrinho"),
  icon: z.string().trim().min(1).nullable().optional(),
  targetAmountCents: z
    .number()
    .int()
    .positive("Valor da meta inválido")
    .nullable()
    .optional(),
  goalDescription: z.string().trim().min(1).nullable().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type CreatePiggyBankBody = z.infer<typeof createPiggyBankBodySchema>;

export const updatePiggyBankBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe um nome para o cofrinho")
    .optional(),
  icon: z.string().trim().min(1).nullable().optional(),
  targetAmountCents: z
    .number()
    .int()
    .positive("Valor da meta inválido")
    .nullable()
    .optional(),
  goalDescription: z.string().trim().min(1).nullable().optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export type UpdatePiggyBankBody = z.infer<typeof updatePiggyBankBodySchema>;

export const piggyBankTransactionBodySchema = z.object({
  amountCents: z.number().int().positive("Informe um valor maior que zero"),
  note: z.string().trim().min(1).optional(),
});

export type PiggyBankTransactionBody = z.infer<
  typeof piggyBankTransactionBodySchema
>;

export const updatePiggyBankStatusBodySchema = z.object({
  status: z.enum(["active", "completed"]),
});

export type UpdatePiggyBankStatusBody = z.infer<
  typeof updatePiggyBankStatusBodySchema
>;

export const piggyBankIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type PiggyBankIdParams = z.infer<typeof piggyBankIdParamsSchema>;

export const listPiggyBanksQuerySchema = z.object({
  status: z.enum(["active", "completed"]).optional(),
});

export type ListPiggyBanksQuery = z.infer<typeof listPiggyBanksQuerySchema>;

export const listPiggyBankTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListPiggyBankTransactionsQuery = z.infer<
  typeof listPiggyBankTransactionsQuerySchema
>;
