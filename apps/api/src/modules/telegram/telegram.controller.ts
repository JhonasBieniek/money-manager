import type { Request, Response } from "express";
import { getUserId } from "../../shared/types/request.js";
import {
  internalAccountQuerySchema,
  internalLinkBodySchema,
} from "./telegram.schema.js";
import * as telegramService from "./telegram.service.js";

export async function createLinkToken(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await telegramService.createLinkToken(getUserId(req));
  res.status(200).json(result);
}

export async function getAccount(req: Request, res: Response): Promise<void> {
  const account = await telegramService.getAccountByUserId(getUserId(req));
  if (!account) {
    res.status(404).json({ message: "Conta Telegram não vinculada" });
    return;
  }
  res.status(200).json(account);
}

export async function internalLink(req: Request, res: Response): Promise<void> {
  const body = internalLinkBodySchema.parse(req.body);
  await telegramService.linkAccount(body);
  res.status(204).send();
}

export async function internalAccountByChat(
  req: Request,
  res: Response,
): Promise<void> {
  const { chatId } = internalAccountQuerySchema.parse(req.query);
  const account = await telegramService.getAccountByChatId(chatId);
  res.status(200).json(account);
}
