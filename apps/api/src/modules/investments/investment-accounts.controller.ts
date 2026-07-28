import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createInvestmentAccountBodySchema,
  investmentAccountIdParamsSchema,
  updateInvestmentAccountBodySchema,
} from "./investment-accounts.schema.js";
import * as investmentAccountsService from "./investment-accounts.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const result = await investmentAccountsService.listInvestmentAccounts(
    getUserId(req),
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = investmentAccountIdParamsSchema.parse(req.params);
  const account = await investmentAccountsService.getInvestmentAccount(
    getUserId(req),
    id,
  );
  res.status(200).json(account);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createInvestmentAccountBodySchema.parse(req.body);
  const account = await investmentAccountsService.createInvestmentAccount(
    getUserId(req),
    body,
  );
  res.status(201).json(account);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = investmentAccountIdParamsSchema.parse(req.params);
  const body = updateInvestmentAccountBodySchema.parse(req.body);
  const account = await investmentAccountsService.updateInvestmentAccount(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(account);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = investmentAccountIdParamsSchema.parse(req.params);
  await investmentAccountsService.deleteInvestmentAccount(getUserId(req), id);
  res.status(204).send();
}
