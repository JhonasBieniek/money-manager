import type { FastifyInstance } from "fastify";
import { requireBotApiKey } from "../../shared/middleware/bot-auth.js";
import * as telegramController from "./telegram.controller.js";

export async function telegramInternalRoutes(
  app: FastifyInstance
): Promise<void> {
  app.addHook("preHandler", requireBotApiKey);

  app.post("/link", telegramController.internalLink);
  app.get("/account", telegramController.internalAccountByChat);
}
