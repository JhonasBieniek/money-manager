import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { categoriesRoutes } from "./modules/categories/categories.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { authenticatePlugin } from "./plugins/authenticate.js";
import { registerCors } from "./plugins/cors.js";
import { registerHelmet } from "./plugins/helmet.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { errorHandler } from "./shared/errors/error-handler.js";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 3001);

async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  app.setErrorHandler(errorHandler);

  await registerCors(app);
  await registerHelmet(app);
  await registerRateLimit(app);
  await app.register(authenticatePlugin);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(expensesRoutes, { prefix: "/v1/expenses" });
  await app.register(categoriesRoutes, { prefix: "/v1/categories" });

  return app;
}

const app = await buildServer();

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
