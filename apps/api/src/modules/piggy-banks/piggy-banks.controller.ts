import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  createPiggyBankBodySchema,
  listPiggyBankTransactionsQuerySchema,
  listPiggyBanksQuerySchema,
  piggyBankIdParamsSchema,
  piggyBankTransactionBodySchema,
  updatePiggyBankBodySchema,
  updatePiggyBankStatusBodySchema,
} from "./piggy-banks.schema.js";
import * as piggyBanksService from "./piggy-banks.service.js";

export async function list(req: Request, res: Response): Promise<void> {
  const query = listPiggyBanksQuerySchema.parse(req.query);
  const result = await piggyBanksService.listPiggyBanks(getUserId(req), query);
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const piggyBank = await piggyBanksService.getPiggyBank(getUserId(req), id);
  res.status(200).json(piggyBank);
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createPiggyBankBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.createPiggyBank(
    getUserId(req),
    body,
  );
  res.status(201).json(piggyBank);
}

export async function update(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = updatePiggyBankBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.updatePiggyBank(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  await piggyBanksService.deletePiggyBank(getUserId(req), id);
  res.status(204).send();
}

export async function deposit(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = piggyBankTransactionBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.depositToPiggyBank(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function withdraw(req: Request, res: Response): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = piggyBankTransactionBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.withdrawFromPiggyBank(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function updateStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const body = updatePiggyBankStatusBodySchema.parse(req.body);
  const piggyBank = await piggyBanksService.updatePiggyBankStatus(
    getUserId(req),
    id,
    body,
  );
  res.status(200).json(piggyBank);
}

export async function listTransactions(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = piggyBankIdParamsSchema.parse(req.params);
  const query = listPiggyBankTransactionsQuerySchema.parse(req.query);
  const result = await piggyBanksService.listPiggyBankTransactions(
    getUserId(req),
    id,
    query,
  );
  res.status(200).json(result);
}
