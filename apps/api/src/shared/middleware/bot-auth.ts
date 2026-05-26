import type { FastifyReply, FastifyRequest } from "fastify";

const HEADER = "x-internal-api-key";

export async function requireBotApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    return reply.status(500).send({ error: "Internal error" });
  }
  const key = request.headers[HEADER];
  if (typeof key !== "string" || key !== expected) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}
