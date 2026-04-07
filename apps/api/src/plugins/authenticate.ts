import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { UnauthorizedError } from "../shared/errors/app-error.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    throw new UnauthorizedError();
  }
  request.userId = "stub-user-id";
}

export const authenticatePlugin = fp(async function registerAuthenticate(
  app: FastifyInstance
) {
  app.decorate("authenticate", authenticate);
});
