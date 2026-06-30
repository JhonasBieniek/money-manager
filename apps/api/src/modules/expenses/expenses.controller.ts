import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  categorizeExpenseBodySchema,
  createExpenseBodySchema,
  createBotExpenseBodySchema,
  expenseIdParamsSchema,
  listExpensesQuerySchema,
  listUncategorizedQuerySchema,
  updateExpenseBodySchema,
} from "./expenses.schema.js";
import * as expensesService from "./expenses.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const body = createExpenseBodySchema.parse(req.body);
  const expense = await expensesService.createExpense(getUserId(req), body);
  res.status(201).json(expense);
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = listExpensesQuerySchema.parse(req.query);
  const result = await expensesService.listExpenses(getUserId(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = expenseIdParamsSchema.parse(req.params);
  const expense = await expensesService.getExpense(getUserId(req), id);
  res.status(200).json(expense);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = expenseIdParamsSchema.parse(req.params);
  const body = updateExpenseBodySchema.parse(req.body);
  const expense = await expensesService.updateExpense(getUserId(req), id, body);
  res.status(200).json(expense);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = expenseIdParamsSchema.parse(req.params);
  await expensesService.deleteExpense(getUserId(req), id);
  res.status(204).send();
}

export async function createBot(req: Request, res: Response): Promise<void> {
  const body = createBotExpenseBodySchema.parse(req.body);
  const expense = await expensesService.createBotExpense(body);
  res.status(201).json({ id: expense.id });
}

export async function uncategorizedCount(
  req: Request,
  res: Response,
): Promise<void> {
  const count = await expensesService.countUncategorizedExpenses(getUserId(req));
  res.status(200).json({ count });
}

export async function listUncategorized(
  req: Request,
  res: Response,
): Promise<void> {
  const query = listUncategorizedQuerySchema.parse(req.query);
  const result = await expensesService.listUncategorizedExpenses(
    getUserId(req),
    query,
  );
  res.status(200).json(result);
}

export async function categorize(req: Request, res: Response): Promise<void> {
  const { id } = expenseIdParamsSchema.parse(req.params);
  const body = categorizeExpenseBodySchema.parse(req.body);
  const expense = await expensesService.categorizeExpense(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(expense);
}
