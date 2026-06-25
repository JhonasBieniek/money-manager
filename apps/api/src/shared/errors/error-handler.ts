import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./app-error.js";

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  console.error("[API Error]", error);
  res.status(500).json({ error: "Internal error" });
}
