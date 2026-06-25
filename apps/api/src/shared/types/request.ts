import type { Request } from "express";

export type AuthenticatedRequest = Request & {
  userId?: string;
};

export function getUserId(req: Request): string {
  const userId = (req as AuthenticatedRequest).userId;
  if (!userId) {
    throw new Error("Missing userId on request");
  }
  return userId;
}
