import type { FastifyReply, FastifyRequest } from "fastify";
import {
  messageIdParamsSchema,
  patchInboundMessageSchema,
  pendingMessagesQuerySchema,
  recordInboundMessageSchema,
} from "./telegram-messages.schema.js";
import * as messagesService from "./telegram-messages.service.js";

export async function recordMessage(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = recordInboundMessageSchema.parse(request.body);
  const result = await messagesService.recordInboundMessage(body);
  await reply.status(201).send(result);
}

export async function patchMessage(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = messageIdParamsSchema.parse(request.params);
  const body = patchInboundMessageSchema.parse(request.body);
  const result = await messagesService.patchInboundMessage(id, body);
  await reply.send(result);
}

export async function listPending(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { chatId } = pendingMessagesQuerySchema.parse(request.query);
  const result = await messagesService.listPendingInboundMessages(chatId);
  await reply.send({ items: result });
}

export async function messagesStatus(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { chatId } = pendingMessagesQuerySchema.parse(request.query);
  const result = await messagesService.getInboundMessagesStatus(chatId);
  await reply.send(result);
}
