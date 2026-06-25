import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getJwtAccessSecret } from "../config/secrets.js";

export const ACCESS_TOKEN_TTL_SEC = 900;

const encoder = new TextEncoder();

function getAccessSecretKey(): Uint8Array {
  return encoder.encode(getJwtAccessSecret());
}

export async function signAccessToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TOKEN_TTL_SEC;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getAccessSecretKey());
}

export async function verifyAccessToken(
  token: string,
): Promise<JWTPayload & { sub: string }> {
  const { payload } = await jwtVerify(token, getAccessSecretKey(), {
    algorithms: ["HS256"],
  });
  if (typeof payload.sub !== "string") {
    throw new Error("Invalid token subject");
  }
  return payload as JWTPayload & { sub: string };
}
