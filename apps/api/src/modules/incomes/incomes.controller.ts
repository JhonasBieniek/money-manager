import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createIncomeBodySchema,
  incomeIdParamsSchema,
  listIncomesQuerySchema,
  updateIncomeBodySchema,
} from "./incomes.schema.js";
import * as incomesService from "./incomes.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const body = createIncomeBodySchema.parse(req.body);
  const income = await incomesService.createIncome(getUserId(req), body);
  res.status(201).json(income);
}

export async function list(req: Request, res: Response): Promise<void> {
  const query = listIncomesQuerySchema.parse(req.query);
  const result = await incomesService.listIncomes(getUserId(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = incomeIdParamsSchema.parse(req.params);
  const income = await incomesService.getIncome(getUserId(req), id);
  res.status(200).json(income);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = incomeIdParamsSchema.parse(req.params);
  const body = updateIncomeBodySchema.parse(req.body);
  const income = await incomesService.updateIncome(getUserId(req), id, body);
  res.status(200).json(income);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = incomeIdParamsSchema.parse(req.params);
  await incomesService.deleteIncome(getUserId(req), id);
  res.status(204).send();
}
