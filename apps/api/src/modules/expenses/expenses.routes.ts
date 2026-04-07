import type { FastifyInstance } from "fastify";
import * as expensesController from "./expenses.controller.js";

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/",
    { preHandler: [app.authenticate] },
    expensesController.list
  );
}
