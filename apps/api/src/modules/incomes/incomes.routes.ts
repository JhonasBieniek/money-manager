import type { FastifyInstance } from "fastify";
import * as incomesController from "./incomes.controller.js";

export async function incomesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", incomesController.list);
  app.post("/", incomesController.create);
  app.get("/:id", incomesController.get);
  app.patch("/:id", incomesController.update);
  app.delete("/:id", incomesController.remove);
}
