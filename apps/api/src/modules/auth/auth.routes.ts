import cookieParser from "cookie-parser";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { csrfProtection } from "../../shared/middleware/csrf.js";
import { createSessionMiddleware } from "../../shared/middleware/session.js";
import * as authController from "./auth.controller.js";

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
  skip: () => process.env.NODE_ENV === "test",
});

export const authRoutes = Router();

authRoutes.use(authLimiter);
authRoutes.use(cookieParser());
authRoutes.use(createSessionMiddleware());
authRoutes.use(csrfProtection);
authRoutes.get("/csrf", (_req, res) => {
  res.status(204).send();
});
authRoutes.post("/register", authController.register);
authRoutes.post("/login", authController.login);
authRoutes.post("/refresh", authController.refresh);
authRoutes.post("/logout", authController.logout);
