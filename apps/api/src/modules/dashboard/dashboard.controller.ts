import type { FastifyRequest, FastifyReply } from "fastify";
import * as dashboardService from "./dashboard.service.js";
import { z } from "zod";

const historyQuerySchema = z.object({
  period: z.enum(["3", "6", "12"]).default("3"),
});

const summaryQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export async function summary(request: FastifyRequest, reply: FastifyReply) {
  const query = summaryQuerySchema.parse(request.query);
  const now = new Date();
  const year = query.year ?? now.getFullYear();
  const month = query.month ?? now.getMonth() + 1;

  const summary = await dashboardService.getDashboardSummary(year, month);
  return reply.send(summary);
}

export async function history(request: FastifyRequest, reply: FastifyReply) {
  const query = historyQuerySchema.parse(request.query);
  const history = await dashboardService.getDashboardHistory(parseInt(query.period));
  return reply.send({ items: history });
}
