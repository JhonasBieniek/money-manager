import type { Request, Response } from "express";
import { chatIdParamsSchema } from "./telegram-sessions.schema.js";
import { getBotUserContext } from "./bot-context.service.js";

export async function getContextByChat(req: Request, res: Response): Promise<void> {
  const { chatId } = chatIdParamsSchema.parse(req.params);
  const context = await getBotUserContext(chatId);
  res.status(200).json(context);
}
