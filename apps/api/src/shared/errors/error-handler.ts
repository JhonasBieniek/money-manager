import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./app-error.js";
import { ZodError } from "zod";

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
    void reply.status(error.statusCode).send({ error: "Request failed" });
    return;
  }
  void reply.status(500).send({ error: "Internal error" });
}
