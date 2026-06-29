import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as telegramController from "./telegram.controller.js";

export const telegramRoutes = Router();

telegramRoutes.post(
  "/link-token",
  authenticate,
  telegramController.createLinkToken,
);
