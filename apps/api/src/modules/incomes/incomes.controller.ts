import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createIncomeSchema,
  incomeIdParamsSchema,
  listIncomesQuerySchema,
  updateIncomeSchema,
} from "./incomes.schema.js";
import * as incomesService from "./incomes.service.js";

export async function create(request: FastifyRequest, reply: FastifyReply) {
  const body = createIncomeSchema.parse(request.body);
  const result = await incomesService.createIncome(body);
  return reply.status(201).send(result);
}

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const query = listIncomesQuerySchema.parse(request.query);
  const result = await incomesService.listIncomes(query);
  return reply.send(result);
}

export async function get(request: FastifyRequest, reply: FastifyReply) {
  const { id } = incomeIdParamsSchema.parse(request.params);
  const result = await incomesService.getIncome(id);
  return reply.send(result);
}

export async function update(request: FastifyRequest, reply: FastifyReply) {
  const { id } = incomeIdParamsSchema.parse(request.params);
  const body = updateIncomeSchema.parse(request.body);
  const result = await incomesService.updateIncome(id, body);
  return reply.send(result);
}

export async function remove(request: FastifyRequest, reply: FastifyReply) {
  const { id } = incomeIdParamsSchema.parse(request.params);
  await incomesService.deleteIncome(id);
  return reply.status(204).send();
}
