import type { NextFunction, Request, Response } from "express";

const HEADER = "x-internal-api-key";

export function requireInternalApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    res.status(500).json({ error: "Internal error" });
    return;
  }

  const key = req.headers[HEADER];
  if (typeof key !== "string" || key !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
