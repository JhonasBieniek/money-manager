import type { FastifyReply, FastifyRequest } from "fastify";
import {
  internalAccountQuerySchema,
  internalLinkBodySchema,
} from "./telegram.schema.js";
import * as telegramService from "./telegram.service.js";

export async function linkHint(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const result = telegramService.getTelegramLinkHint();
  await reply.send(result);
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
  const linked = await telegramService.isTelegramChatLinked(chatId);
  if (!linked) {
    await reply.status(404).send({ error: "Not found" });
    return;
  }
  await reply.send({ linked: true });
}
