import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createExpenseSchema,
  expenseIdParamsSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
} from "./expenses.schema.js";
import * as expensesService from "./expenses.service.js";

export async function create(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = createExpenseSchema.parse(request.body);
  const result = await expensesService.createExpense(body);
  await reply.status(201).send(result);
}

export async function list(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = listExpensesQuerySchema.parse(request.query);
  const result = await expensesService.listExpenses(query);
  await reply.send(result);
}

export async function update(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = expenseIdParamsSchema.parse(request.params);
  const body = updateExpenseSchema.parse(request.body);
  const result = await expensesService.updateExpense(id, body);
  await reply.send(result);
}

export async function remove(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = expenseIdParamsSchema.parse(request.params);
  await expensesService.deleteExpense(id);
  await reply.status(204).send();
}

export async function get(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = expenseIdParamsSchema.parse(request.params);
  const result = await expensesService.getExpense(id);
  await reply.send(result);
}
