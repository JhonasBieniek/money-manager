import type { Request, Response } from "express";
import {
  chatIdParamsSchema,
  createBotSessionBodySchema,
  patchBotSessionBodySchema,
  sessionIdParamsSchema,
} from "./telegram-sessions.schema.js";
import * as sessionsService from "./telegram-sessions.service.js";

export async function createSession(req: Request, res: Response): Promise<void> {
  const body = createBotSessionBodySchema.parse(req.body);
  const result = await sessionsService.createOrReplaceSession(body);
  res.status(201).json(result);
}

export async function getSessionByChat(req: Request, res: Response): Promise<void> {
  const { chatId } = chatIdParamsSchema.parse(req.params);
  const session = await sessionsService.getActiveSessionByChat(chatId);
  if (!session) {
    res.status(404).json({ error: "Sessão não encontrada" });
    return;
  }
  res.status(200).json({ session });
}

export async function patchSession(req: Request, res: Response): Promise<void> {
  const { id } = sessionIdParamsSchema.parse(req.params);
  const body = patchBotSessionBodySchema.parse(req.body);
  const session = await sessionsService.patchSession(id, body);
  res.status(200).json({ session });
}

export async function deleteSessionByChat(
  req: Request,
  res: Response,
): Promise<void> {
  const { chatId } = chatIdParamsSchema.parse(req.params);
  await sessionsService.deleteSessionByChat(chatId);
  res.status(204).send();
}
