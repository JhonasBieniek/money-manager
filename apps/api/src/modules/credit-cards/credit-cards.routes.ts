import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as creditCardsController from "./credit-cards.controller.js";

export const creditCardsRoutes = Router();

creditCardsRoutes.get(
  "/statements/current",
  authenticate,
  creditCardsController.currentStatements,
);
creditCardsRoutes.get("/", authenticate, creditCardsController.list);
creditCardsRoutes.post("/", authenticate, creditCardsController.create);
creditCardsRoutes.patch("/:id", authenticate, creditCardsController.update);
creditCardsRoutes.delete("/:id", authenticate, creditCardsController.remove);
creditCardsRoutes.get(
  "/:id/statements",
  authenticate,
  creditCardsController.listStatements,
);
creditCardsRoutes.patch(
  "/:id/statements/:statementId",
  authenticate,
  creditCardsController.updateStatement,
);
