import type { FastifyReply, FastifyRequest } from "fastify";

const HEADER = "x-internal-api-key";

export async function requireBotApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    await reply.status(500).send({ error: "Internal error" });
    return;
  }
  const key = request.headers[HEADER];
  if (typeof key !== "string" || key !== expected) {
    await reply.status(401).send({ error: "Unauthorized" });
  }
}
