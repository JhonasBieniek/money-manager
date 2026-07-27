import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createDebtBodySchema,
  debtIdParamsSchema,
  installmentIdParamsSchema,
  setInstallmentStatusBodySchema,
  updateDebtBodySchema,
} from "./debts.schema.js";
import * as debtsService from "./debts.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const result = await debtsService.listDebts(getUserId(req));
  res.status(200).json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createDebtBodySchema.parse(req.body);
  const debt = await debtsService.createDebt(getUserId(req), body);
  res.status(201).json(debt);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = debtIdParamsSchema.parse(req.params);
  const body = updateDebtBodySchema.parse(req.body);
  const debt = await debtsService.updateDebt(getUserId(req), id, body);
  res.status(200).json(debt);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = debtIdParamsSchema.parse(req.params);
  await debtsService.deleteDebt(getUserId(req), id);
  res.status(204).send();
}

export async function setInstallmentStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const { debtId, installmentId } = installmentIdParamsSchema.parse(
    req.params,
  );
  const { status } = setInstallmentStatusBodySchema.parse(req.body);
  const debt = await debtsService.setInstallmentStatus(
    getUserId(req),
    debtId,
    installmentId,
    status,
  );
  res.status(200).json(debt);
}
