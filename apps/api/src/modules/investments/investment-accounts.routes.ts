import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as investmentAccountsController from "./investment-accounts.controller.js";

export const investmentAccountsRoutes = Router();

investmentAccountsRoutes.get(
  "/",
  authenticate,
  investmentAccountsController.list,
);
investmentAccountsRoutes.post(
  "/",
  authenticate,
  investmentAccountsController.create,
);
investmentAccountsRoutes.get(
  "/:id",
  authenticate,
  investmentAccountsController.get,
);
investmentAccountsRoutes.patch(
  "/:id",
  authenticate,
  investmentAccountsController.update,
);
investmentAccountsRoutes.delete(
  "/:id",
  authenticate,
  investmentAccountsController.remove,
);
