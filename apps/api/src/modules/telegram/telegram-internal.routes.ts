import { Router } from "express";
import { requireInternalApiKey } from "../../shared/middleware/internal-auth.js";
import * as telegramController from "./telegram.controller.js";
import * as telegramMessagesController from "./telegram-messages.controller.js";
import * as telegramSessionsController from "./telegram-sessions.controller.js";

export const telegramInternalRoutes = Router();

telegramInternalRoutes.use(requireInternalApiKey);
telegramInternalRoutes.post("/link", telegramController.internalLink);
telegramInternalRoutes.get("/account", telegramController.internalAccountByChat);
telegramInternalRoutes.post("/messages", telegramMessagesController.recordMessage);
telegramInternalRoutes.patch("/messages/:id", telegramMessagesController.patchMessage);
telegramInternalRoutes.get("/messages/pending", telegramMessagesController.listPending);
telegramInternalRoutes.get("/messages/status", telegramMessagesController.messagesStatus);
telegramInternalRoutes.get(
  "/messages/retry-eligible",
  telegramMessagesController.listRetryEligible,
);
telegramInternalRoutes.post("/sessions", telegramSessionsController.createSession);
telegramInternalRoutes.get(
  "/sessions/by-chat/:chatId",
  telegramSessionsController.getSessionByChat,
);
telegramInternalRoutes.patch("/sessions/:id", telegramSessionsController.patchSession);
telegramInternalRoutes.delete(
  "/sessions/by-chat/:chatId",
  telegramSessionsController.deleteSessionByChat,
);
