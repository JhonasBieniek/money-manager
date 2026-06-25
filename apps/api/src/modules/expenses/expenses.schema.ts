import { z } from "zod";
import { GOAL_CATEGORIES, type GoalCategory } from "@money-manager/types";
import { uuidArrayQueryParam } from "../../shared/schemas/query-params.js";

const monthYearRefine = <T extends { month?: number; year?: number }>(
  data: T,
) => {
  const hasMonth = data.month !== undefined;
  const hasYear = data.year !== undefined;
  return hasMonth === hasYear;
};

export const goalCategorySchema = z.enum(
  GOAL_CATEGORIES as [GoalCategory, ...GoalCategory[]],
);

export const listExpensesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    goalCategory: goalCategorySchema.optional(),
    description: z.string().trim().min(1).optional(),
    tagIds: uuidArrayQueryParam(),
  })
  .refine(monthYearRefine, {
    message: "month e year devem ser informados juntos",
  });

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export const createExpenseBodySchema = z.object({
  amount: z.number().nonnegative("O valor não pode ser negativo"),
  description: z.string().trim().min(1, "A descrição é obrigatória"),
  goalCategory: goalCategorySchema,
  occurredAt: z.string().datetime({ offset: true }).optional(),
  paymentMethodIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  cardLastFour: z.string().length(4).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

export type CreateExpenseBody = z.infer<typeof createExpenseBodySchema>;

export const updateExpenseBodySchema = createExpenseBodySchema
  .partial()
  .omit({ idempotencyKey: true });

export type UpdateExpenseBody = z.infer<typeof updateExpenseBodySchema>;

export const expenseIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ExpenseIdParams = z.infer<typeof expenseIdParamsSchema>;
