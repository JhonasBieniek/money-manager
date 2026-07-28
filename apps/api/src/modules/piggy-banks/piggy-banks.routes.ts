import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as piggyBanksController from "./piggy-banks.controller.js";

export const piggyBanksRoutes = Router();

piggyBanksRoutes.get("/", authenticate, piggyBanksController.list);
piggyBanksRoutes.post("/", authenticate, piggyBanksController.create);
piggyBanksRoutes.get("/:id", authenticate, piggyBanksController.get);
piggyBanksRoutes.patch("/:id", authenticate, piggyBanksController.update);
piggyBanksRoutes.delete("/:id", authenticate, piggyBanksController.remove);
piggyBanksRoutes.post(
  "/:id/deposit",
  authenticate,
  piggyBanksController.deposit,
);
piggyBanksRoutes.post(
  "/:id/withdraw",
  authenticate,
  piggyBanksController.withdraw,
);
piggyBanksRoutes.patch(
  "/:id/status",
  authenticate,
  piggyBanksController.updateStatus,
);
piggyBanksRoutes.get(
  "/:id/transactions",
  authenticate,
  piggyBanksController.listTransactions,
);
