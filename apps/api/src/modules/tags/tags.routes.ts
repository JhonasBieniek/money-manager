import type { FastifyInstance } from "fastify";
import * as tagsController from "./tags.controller.js";

export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", tagsController.list);
  app.post("/", tagsController.create);
  app.get("/:id", tagsController.get);
  app.patch("/:id", tagsController.update);
  app.delete("/:id", tagsController.remove);
}
