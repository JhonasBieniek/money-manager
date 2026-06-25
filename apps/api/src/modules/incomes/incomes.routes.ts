import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as incomesController from "./incomes.controller.js";

export const incomesRoutes = Router();

incomesRoutes.get("/", authenticate, incomesController.list);
incomesRoutes.post("/", authenticate, incomesController.create);
incomesRoutes.get("/:id", authenticate, incomesController.get);
incomesRoutes.patch("/:id", authenticate, incomesController.update);
incomesRoutes.delete("/:id", authenticate, incomesController.remove);
