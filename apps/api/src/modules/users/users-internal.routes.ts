import { Router } from "express";
import { requireInternalApiKey } from "../../shared/middleware/internal-auth.js";
import * as botContextController from "../telegram/bot-context.controller.js";

export const usersInternalRoutes = Router();

usersInternalRoutes.use(requireInternalApiKey);
usersInternalRoutes.get(
  "/by-chat/:chatId/context",
  botContextController.getContextByChat,
);
