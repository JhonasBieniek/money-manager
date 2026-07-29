import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as providerCredentialsController from "./provider-credentials.controller.js";

export const providerCredentialsRoutes = Router();

providerCredentialsRoutes.get(
  "/",
  authenticate,
  providerCredentialsController.list,
);
providerCredentialsRoutes.put(
  "/:provider",
  authenticate,
  providerCredentialsController.set,
);
providerCredentialsRoutes.delete(
  "/:provider",
  authenticate,
  providerCredentialsController.remove,
);
