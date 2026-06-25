import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../../lib/jwt.js";
import { UnauthorizedError } from "../errors/app-error.js";
import type { AuthenticatedRequest } from "../types/request.js";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }
    const token = auth.slice("Bearer ".length).trim();
    const payload = await verifyAccessToken(token);
    (req as AuthenticatedRequest).userId = payload.sub;
    next();
  } catch (err) {
    next(err instanceof UnauthorizedError ? err : new UnauthorizedError());
  }
}
