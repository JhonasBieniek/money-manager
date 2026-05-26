import type { FastifyInstance } from "fastify";
import * as expensesController from "./expenses.controller.js";

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/uncategorized/count", expensesController.uncategorizedCount);
  app.get("/uncategorized", expensesController.listUncategorized);
  app.get("/", expensesController.list);
  app.post("/", expensesController.create);
  app.patch("/:id/categorize", expensesController.categorize);
  app.get("/:id", expensesController.get);
  app.patch("/:id", expensesController.update);
  app.delete("/:id", expensesController.remove);
}
