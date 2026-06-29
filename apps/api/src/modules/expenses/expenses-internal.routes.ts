import { Router } from "express";
import { requireInternalApiKey } from "../../shared/middleware/internal-auth.js";
import * as expensesController from "./expenses.controller.js";

export const expensesInternalRoutes = Router();

expensesInternalRoutes.use(requireInternalApiKey);
expensesInternalRoutes.post("/", expensesController.createBot);
