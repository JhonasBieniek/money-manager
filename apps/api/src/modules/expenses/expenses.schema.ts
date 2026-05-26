import { GOAL_CATEGORIES } from "@money-manager/types";
import { z } from "zod";

export const goalCategorySchema = z.enum(GOAL_CATEGORIES);

export const listExpensesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  description: z.string().optional(),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export const createExpenseSchema = z.object({
  amount: z.number().nonnegative("O valor não pode ser negativo"),
  description: z.string().min(1, "A descrição é obrigatória"),
  goalCategory: goalCategorySchema,
  occurredAt: z.string().datetime().optional(),
  paymentMethodIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  cardLastFour: z.string().length(4).optional(),
  idempotencyKey: z.string().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export type CreateExpenseBody = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial().omit({ idempotencyKey: true });

export type UpdateExpenseBody = z.infer<typeof updateExpenseSchema>;

export const expenseIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ExpenseIdParams = z.infer<typeof expenseIdParamsSchema>;
