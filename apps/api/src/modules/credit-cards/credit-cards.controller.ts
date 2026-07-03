import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createCreditCardBodySchema,
  creditCardIdParamsSchema,
  currentStatementsQuerySchema,
  listStatementsQuerySchema,
  statementIdParamsSchema,
  updateCreditCardBodySchema,
  updateStatementBodySchema,
} from "./credit-cards.schema.js";
import * as creditCardsService from "./credit-cards.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const result = await creditCardsService.listCreditCards(getUserId(req));
  res.status(200).json(result);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createCreditCardBodySchema.parse(req.body);
  const card = await creditCardsService.createCreditCard(getUserId(req), body);
  res.status(201).json(card);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = creditCardIdParamsSchema.parse(req.params);
  const body = updateCreditCardBodySchema.parse(req.body);
  const card = await creditCardsService.updateCreditCard(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(card);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = creditCardIdParamsSchema.parse(req.params);
  await creditCardsService.deleteCreditCard(getUserId(req), id);
  res.status(204).send();
}

export async function listStatements(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = creditCardIdParamsSchema.parse(req.params);
  const query = listStatementsQuerySchema.parse(req.query);
  const result = await creditCardsService.listStatements(
    getUserId(req),
    id,
    query,
  );
  res.status(200).json(result);
}

export async function currentStatements(
  req: Request,
  res: Response,
): Promise<void> {
  const query = currentStatementsQuerySchema.parse(req.query);
  const result = await creditCardsService.getCurrentStatements(
    getUserId(req),
    query,
  );
  res.status(200).json(result);
}

export async function updateStatement(
  req: Request,
  res: Response,
): Promise<void> {
  const { id, statementId } = statementIdParamsSchema.parse(req.params);
  const body = updateStatementBodySchema.parse(req.body);
  const statement = await creditCardsService.updateStatement(
    getUserId(req),
    id,
    statementId,
    body,
  );
  res.status(200).json(statement);
}
