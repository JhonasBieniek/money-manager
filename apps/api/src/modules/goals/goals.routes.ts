import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as goalsController from "./goals.controller.js";

export const goalsRoutes = Router();

goalsRoutes.get("/usage", authenticate, goalsController.usage);
goalsRoutes.get("/", authenticate, goalsController.list);
goalsRoutes.post("/", authenticate, goalsController.upsert);
