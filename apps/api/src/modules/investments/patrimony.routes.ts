import { Router } from "express";
import { authenticate } from "../../shared/middleware/authenticate.js";
import * as patrimonyController from "./patrimony.controller.js";

export const patrimonyRoutes = Router();

patrimonyRoutes.get("/summary", authenticate, patrimonyController.getSummary);
patrimonyRoutes.get("/history", authenticate, patrimonyController.getHistory);
patrimonyRoutes.post(
  "/snapshots",
  authenticate,
  patrimonyController.registerSnapshot,
);
patrimonyRoutes.get(
  "/benchmarks",
  authenticate,
  patrimonyController.getBenchmarks,
);
