import { createHash, randomBytes } from "node:crypto";

export function generateRefreshTokenPlain(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}
