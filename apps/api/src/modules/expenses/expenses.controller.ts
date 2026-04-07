import type { FastifyReply, FastifyRequest } from "fastify";
import { listExpensesQuerySchema } from "./expenses.schema.js";
import * as expensesService from "./expenses.service.js";

export async function list(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = listExpensesQuerySchema.parse(request.query);
  const userId = request.userId;
  if (!userId) {
    await reply.status(401).send({ error: "Unauthorized" });
    return;
  }
  const result = await expensesService.listExpenses(userId, query);
  await reply.send(result);
}
