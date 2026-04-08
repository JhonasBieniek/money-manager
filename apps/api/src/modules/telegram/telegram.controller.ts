import type { FastifyReply, FastifyRequest } from "fastify";
import {
  internalAccountQuerySchema,
  internalLinkBodySchema,
} from "./telegram.schema.js";
import * as telegramService from "./telegram.service.js";

export async function createLinkToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.userId;
  if (!userId) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  const result = await telegramService.createTelegramLinkToken(userId);
  await reply.status(201).send(result);
}

export async function internalLink(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = internalLinkBodySchema.parse(request.body);
  await telegramService.linkTelegramAccount(body);
  await reply.status(204).send();
}

export async function internalAccountByChat(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { chatId } = internalAccountQuerySchema.parse(request.query);
  const userId = await telegramService.findUserIdByTelegramChatId(chatId);
  if (!userId) {
    await reply.status(404).send({ error: "Not found" });
    return;
  }
  await reply.send({ userId });
}
