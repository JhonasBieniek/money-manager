import Fastify, { type FastifyInstance } from "fastify";
import { expensesInternalRoutes } from "./modules/expenses/expenses-internal.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { incomesRoutes } from "./modules/incomes/incomes.routes.js";
import { goalsRoutes } from "./modules/goals/goals.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { tagsRoutes } from "./modules/tags/tags.routes.js";
import { telegramInternalRoutes } from "./modules/telegram/telegram-internal.routes.js";
import { telegramRoutes } from "./modules/telegram/telegram.routes.js";
import { registerCors } from "./plugins/cors.js";
import { registerHelmet } from "./plugins/helmet.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { errorHandler } from "./shared/errors/error-handler.js";

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    ignoreTrailingSlash: true,
  });
  app.setErrorHandler(errorHandler);

  await registerCors(app);
  await registerHelmet(app);
  await registerRateLimit(app);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(expensesRoutes, { prefix: "/v1/expenses" });
  await app.register(incomesRoutes, { prefix: "/v1/incomes" });
  await app.register(goalsRoutes, { prefix: "/v1/goals" });
  await app.register(dashboardRoutes, { prefix: "/v1/dashboard" });
  await app.register(tagsRoutes, { prefix: "/v1/tags" });
  await app.register(telegramRoutes, { prefix: "/v1/telegram" });
  await app.register(telegramInternalRoutes, {
    prefix: "/v1/internal/telegram",
  });
  await app.register(expensesInternalRoutes, {
    prefix: "/v1/internal/expenses",
  });

  return app;
}
