import type { FastifyInstance } from "fastify";
import * as dashboardController from "./dashboard.controller.js";

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/summary", dashboardController.summary);
  app.get("/history", dashboardController.history);
}
