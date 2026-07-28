import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as investmentHoldingsController from "./investment-holdings.controller.js";

export const investmentHoldingsRoutes = Router();

investmentHoldingsRoutes.get(
  "/",
  authenticate,
  investmentHoldingsController.list,
);
investmentHoldingsRoutes.post(
  "/",
  authenticate,
  investmentHoldingsController.create,
);
investmentHoldingsRoutes.get(
  "/:id",
  authenticate,
  investmentHoldingsController.get,
);
investmentHoldingsRoutes.patch(
  "/:id",
  authenticate,
  investmentHoldingsController.update,
);
investmentHoldingsRoutes.patch(
  "/:id/valuation",
  authenticate,
  investmentHoldingsController.updateValuation,
);
investmentHoldingsRoutes.patch(
  "/:id/quote-mode",
  authenticate,
  investmentHoldingsController.updateQuoteMode,
);
investmentHoldingsRoutes.post(
  "/:id/refresh-quote",
  authenticate,
  investmentHoldingsController.refreshQuote,
);
investmentHoldingsRoutes.delete(
  "/:id",
  authenticate,
  investmentHoldingsController.remove,
);
