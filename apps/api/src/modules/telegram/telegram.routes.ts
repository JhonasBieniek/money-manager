import type { FastifyInstance } from "fastify";
import * as telegramController from "./telegram.controller.js";

export async function telegramRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/link-token",
    { preHandler: [app.authenticate] },
    telegramController.createLinkToken
  );
}
