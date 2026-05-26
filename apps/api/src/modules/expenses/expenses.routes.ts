import type { FastifyInstance } from "fastify";
import * as expensesController from "./expenses.controller.js";

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", expensesController.list);
  app.post("/", expensesController.create);
  app.get("/:id", expensesController.get);
  app.patch("/:id", expensesController.update);
  app.delete("/:id", expensesController.remove);
}
