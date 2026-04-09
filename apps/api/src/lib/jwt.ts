import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { ACCESS_TOKEN_TTL_SEC } from "../modules/auth/auth.constants.js";

const encoder = new TextEncoder();

function getAccessSecret(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) {
    throw new Error("JWT_ACCESS_SECRET is required");
  }
  return encoder.encode(s);
}

export async function signAccessToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TOKEN_TTL_SEC;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getAccessSecret());
}

export async function verifyAccessToken(token: string): Promise<JWTPayload & { sub: string }> {
  const { payload } = await jwtVerify(token, getAccessSecret(), {
    algorithms: ["HS256"],
  });
  if (typeof payload.sub !== "string") {
    throw new Error("Invalid token subject");
  }
  return payload as JWTPayload & { sub: string };
}
