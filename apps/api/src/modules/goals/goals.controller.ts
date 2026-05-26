import type { FastifyRequest, FastifyReply } from "fastify";
import * as goalsService from "./goals.service.js";
import { upsertGoalsSchema, listGoalsQuerySchema } from "./goals.schema.js";

export async function list(_request: FastifyRequest, reply: FastifyReply) {
  const goals = await goalsService.listGoals();
  return reply.send({ items: goals });
}

export async function upsert(request: FastifyRequest, reply: FastifyReply) {
  const body = upsertGoalsSchema.parse(request.body);
  const goals = await goalsService.upsertGoals(body);
  return reply.send({ items: goals });
}

export async function usage(request: FastifyRequest, reply: FastifyReply) {
  const query = listGoalsQuerySchema.parse(request.query);
  const now = new Date();
  const year = query.year ?? now.getFullYear();
  const month = query.month ?? now.getMonth() + 1;

  const usage = await goalsService.getGoalUsage(year, month);
  return reply.send({ items: usage });
}
