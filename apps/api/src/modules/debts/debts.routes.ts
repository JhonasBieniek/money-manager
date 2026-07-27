import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as debtsController from "./debts.controller.js";

export const debtsRoutes = Router();

debtsRoutes.get("/", authenticate, debtsController.list);
debtsRoutes.post("/", authenticate, debtsController.create);
debtsRoutes.patch("/:id", authenticate, debtsController.update);
debtsRoutes.delete("/:id", authenticate, debtsController.remove);
debtsRoutes.patch(
  "/:debtId/installments/:installmentId",
  authenticate,
  debtsController.setInstallmentStatus,
);
