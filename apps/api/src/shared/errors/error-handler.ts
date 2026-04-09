import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";

const PUBLIC_INVALID_CREDENTIALS = "Email/Senha incorreto";

export function errorHandler(
  error: Error,
  _request: FastifyRequest,
  reply: FastifyReply
): void {
  if (error instanceof ZodError) {
    void reply.status(400).send({ error: "Invalid request" });
    return;
  }
  if (error instanceof AppError) {
    if (error.code === "INVALID_CREDENTIALS") {
      void reply.status(error.statusCode).send({ error: PUBLIC_INVALID_CREDENTIALS });
      return;
    }
    void reply.status(error.statusCode).send({ error: "Request failed" });
    return;
  }
  void reply.status(500).send({ error: "Internal error" });
}
