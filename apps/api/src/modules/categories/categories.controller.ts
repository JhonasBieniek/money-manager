import type { FastifyReply, FastifyRequest } from "fastify";
import { createCategoryBodySchema } from "./categories.schema.js";
import * as categoriesService from "./categories.service.js";

export async function create(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createCategoryBodySchema.parse(request.body);
  const userId = request.userId;
  if (!userId) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  const result = await categoriesService.createCategory(userId, body);
  await reply.status(201).send(result);
}
