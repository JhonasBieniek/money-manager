import type { FastifyInstance } from "fastify";
import * as goalsController from "./goals.controller.js";

export async function goalsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", goalsController.list);
  app.post("/", goalsController.upsert);
  app.get("/usage", goalsController.usage);
}
