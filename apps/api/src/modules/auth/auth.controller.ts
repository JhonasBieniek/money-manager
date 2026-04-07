import type { FastifyReply, FastifyRequest } from "fastify";
import { registerBodySchema } from "./auth.schema.js";
import * as authService from "./auth.service.js";

export async function register(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = registerBodySchema.parse(request.body);
  const result = await authService.registerUser(body);
  await reply.status(201).send(result);
}
