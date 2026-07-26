import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { checkDbConnection } from "@money-manager/db";
import type { HealthResponse } from "@money-manager/types";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { creditCardsRoutes } from "./modules/credit-cards/credit-cards.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { debtsRoutes } from "./modules/debts/debts.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { expensesInternalRoutes } from "./modules/expenses/expenses-internal.routes.js";
import { goalsRoutes } from "./modules/goals/goals.routes.js";
import { incomesRoutes } from "./modules/incomes/incomes.routes.js";
import { tagsRoutes } from "./modules/tags/tags.routes.js";
import { telegramInternalRoutes } from "./modules/telegram/telegram-internal.routes.js";
import { telegramRoutes } from "./modules/telegram/telegram.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { usersInternalRoutes } from "./modules/users/users-internal.routes.js";
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
      skip: () => process.env.NODE_ENV === "test",
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_req, res) => {
    const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
    const dbOk = hasDatabaseUrl ? await checkDbConnection() : true;
    const body: HealthResponse = {
      status: dbOk ? "ok" : "degraded",
      ...(hasDatabaseUrl ? { db: dbOk ? "ok" : "unavailable" } : {}),
    };
    res.status(dbOk ? 200 : 503).json(body);
  });

  app.use("/v1/auth", authRoutes);
  app.use("/v1/me", userRoutes);
  app.use("/v1/tags", tagsRoutes);
  app.use("/v1/goals", goalsRoutes);
  app.use("/v1/credit-cards", creditCardsRoutes);
  app.use("/v1/debts", debtsRoutes);
  app.use("/v1/expenses", expensesRoutes);
  app.use("/v1/incomes", incomesRoutes);
  app.use("/v1/dashboard", dashboardRoutes);
  app.use("/v1/telegram", telegramRoutes);
  app.use("/v1/internal/telegram", telegramInternalRoutes);
  app.use("/v1/internal/users", usersInternalRoutes);
  app.use("/v1/internal/expenses", expensesInternalRoutes);

  app.use(errorHandler);

  return app;
}
