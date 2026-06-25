import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createExpenseBodySchema,
  expenseIdParamsSchema,
  listExpensesQuerySchema,
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
