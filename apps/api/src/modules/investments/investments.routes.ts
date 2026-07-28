import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as investmentsController from "./investments.controller.js";

export const investmentsRoutes = Router();

investmentsRoutes.post(
  "/refresh-quotes",
  authenticate,
  investmentsController.refreshAllQuotes,
);
