import type { FastifyInstance } from "fastify";
import * as categoriesController from "./categories.controller.js";

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/",
    { preHandler: [app.authenticate] },
    categoriesController.create
  );
}
