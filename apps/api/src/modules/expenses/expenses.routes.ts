import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as expensesController from "./expenses.controller.js";

export const expensesRoutes = Router();

expensesRoutes.get("/", authenticate, expensesController.list);
expensesRoutes.post("/", authenticate, expensesController.create);
expensesRoutes.get("/:id", authenticate, expensesController.get);
expensesRoutes.patch("/:id", authenticate, expensesController.update);
expensesRoutes.delete("/:id", authenticate, expensesController.remove);
