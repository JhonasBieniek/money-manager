import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { checkDbConnection } from "@money-manager/db";
import type { HealthResponse } from "@money-manager/types";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { getAllowedCorsOrigins } from "./shared/cors.js";
import { errorHandler } from "./shared/errors/error-handler.js";

export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedCorsOrigins();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins === false) {
          callback(null, false);
          return;
        }
        callback(null, allowedOrigins.includes(origin));
      },
      credentials: true,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    const dbOk = await checkDbConnection();
    const body: HealthResponse = {
      status: "ok",
      ...(process.env.DATABASE_URL ? { db: dbOk ? "ok" : "unavailable" } : {}),
    };
    res.status(200).json(body);
  });

  app.use("/v1/auth", authRoutes);
  app.use("/v1/me", userRoutes);

  app.use(errorHandler);

  return app;
}
