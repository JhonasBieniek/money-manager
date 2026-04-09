import type { FastifyInstance } from "fastify";
import * as authController from "./auth.controller.js";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/register", authController.register);
  app.post("/login", authController.login);
  app.post("/refresh", authController.refresh);
}
