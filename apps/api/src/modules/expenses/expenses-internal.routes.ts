import type { FastifyInstance } from "fastify";
import { requireBotApiKey } from "../../shared/middleware/bot-auth.js";
import * as expensesController from "./expenses.controller.js";

export async function expensesInternalRoutes(
  app: FastifyInstance
): Promise<void> {
  app.addHook("preHandler", requireBotApiKey);

  app.post("/", expensesController.createBot);
}
