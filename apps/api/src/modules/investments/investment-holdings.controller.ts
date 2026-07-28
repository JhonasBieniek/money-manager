import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createInvestmentHoldingBodySchema,
  investmentHoldingIdParamsSchema,
  listInvestmentHoldingsQuerySchema,
  updateHoldingValuationBodySchema,
  updateInvestmentHoldingBodySchema,
} from "./investment-holdings.schema.js";
import * as investmentHoldingsService from "./investment-holdings.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = listInvestmentHoldingsQuerySchema.parse(req.query);
  const result = await investmentHoldingsService.listInvestmentHoldings(
    getUserId(req),
    query,
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const holding = await investmentHoldingsService.getInvestmentHolding(
    getUserId(req),
    id,
  );
  res.status(200).json(holding);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createInvestmentHoldingBodySchema.parse(req.body);
  const holding = await investmentHoldingsService.createInvestmentHolding(
    getUserId(req),
    body,
  );
  res.status(201).json(holding);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const body = updateInvestmentHoldingBodySchema.parse(req.body);
  const holding = await investmentHoldingsService.updateInvestmentHolding(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(holding);
}

export async function updateValuation(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  const body = updateHoldingValuationBodySchema.parse(req.body);
  const holding = await investmentHoldingsService.updateHoldingValuation(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(holding);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = investmentHoldingIdParamsSchema.parse(req.params);
  await investmentHoldingsService.deleteInvestmentHolding(getUserId(req), id);
  res.status(204).send();
}
