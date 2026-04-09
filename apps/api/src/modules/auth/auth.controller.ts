import type { FastifyReply, FastifyRequest } from "fastify";
import { loginBodySchema, registerBodySchema } from "./auth.schema.js";
import { REFRESH_COOKIE_NAME, REFRESH_TOKEN_DAYS } from "./auth.constants.js";
import * as authService from "./auth.service.js";

function refreshCookieOptions(): {
  path: string;
  httpOnly: boolean;
  sameSite: "strict";
  secure: boolean;
  maxAge: number;
} {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60,
  };
}

function clientMeta(request: FastifyRequest): authService.LoginMeta {
  return {
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
    ip: request.ip,
  };
}

export async function register(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = registerBodySchema.parse(request.body);
  const result = await authService.registerUser(body);
  await reply.status(201).send(result);
}

export async function login(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = loginBodySchema.parse(request.body);
  const result = await authService.loginUser(body, clientMeta(request));
  await reply
    .setCookie(REFRESH_COOKIE_NAME, result.refreshTokenPlain, refreshCookieOptions())
    .status(200)
    .send(result.body);
}

export async function refresh(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const raw = request.cookies[REFRESH_COOKIE_NAME];
  const result = await authService.refreshSession(raw, clientMeta(request));
  await reply
    .setCookie(REFRESH_COOKIE_NAME, result.refreshTokenPlain, refreshCookieOptions())
    .status(200)
    .send(result.body);
}
