import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as dashboardController from "./dashboard.controller.js";

export const dashboardRoutes = Router();

dashboardRoutes.get("/summary", authenticate, dashboardController.summary);
dashboardRoutes.get("/history", authenticate, dashboardController.history);
