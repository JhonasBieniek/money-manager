import type { Request, Response } from "express";
import {
  messageIdParamsSchema,
  patchInboundMessageSchema,
  pendingMessagesQuerySchema,
  recordInboundMessageSchema,
  retryEligibleQuerySchema,
} from "./telegram-messages.schema.js";
import * as messagesService from "./telegram-messages.service.js";

export async function recordMessage(req: Request, res: Response): Promise<void> {
  const body = recordInboundMessageSchema.parse(req.body);
  const result = await messagesService.recordInboundMessage(body);
  res.status(201).json(result);
}

export async function patchMessage(req: Request, res: Response): Promise<void> {
  const { id } = messageIdParamsSchema.parse(req.params);
  const body = patchInboundMessageSchema.parse(req.body);
  const result = await messagesService.patchInboundMessage(id, body);
  res.status(200).json(result);
}

export async function listPending(req: Request, res: Response): Promise<void> {
  const { chatId } = pendingMessagesQuerySchema.parse(req.query);
  const result = await messagesService.listPendingInboundMessages(chatId);
  res.status(200).json({ items: result });
}

export async function messagesStatus(req: Request, res: Response): Promise<void> {
  const { chatId } = pendingMessagesQuerySchema.parse(req.query);
  const result = await messagesService.getInboundMessagesStatus(chatId);
  res.status(200).json(result);
}

export async function listRetryEligible(
  req: Request,
  res: Response,
): Promise<void> {
  const query = retryEligibleQuerySchema.parse(req.query);
  const items = await messagesService.listRetryEligibleInboundMessages(query);
  res.status(200).json({ items });
}
