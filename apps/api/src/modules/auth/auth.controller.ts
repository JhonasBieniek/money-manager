import type { Request, Response } from "express";
import type { LoginMeta } from "./auth.service.js";
import * as authService from "./auth.service.js";
import { loginBodySchema, registerBodySchema } from "./auth.schema.js";
import { REFRESH_COOKIE_NAME, REFRESH_TOKEN_DAYS } from "./auth.constants.js";

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
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  };
}

function clearRefreshCookieOptions(): {
  path: string;
  httpOnly: boolean;
  sameSite: "strict";
  secure: boolean;
  maxAge: number;
} {
  return {
    ...refreshCookieOptions(),
    maxAge: 0,
  };
}

function clientMeta(req: Request): LoginMeta {
  return {
    userAgent:
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : undefined,
    ip: req.ip,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const body = registerBodySchema.parse(req.body);
  const result = await authService.registerUser(body, clientMeta(req));
  res
    .cookie(REFRESH_COOKIE_NAME, result.refreshTokenPlain, refreshCookieOptions())
    .status(201)
    .json(result.body);
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = loginBodySchema.parse(req.body);
  const result = await authService.loginUser(body, clientMeta(req));
  res
    .cookie(REFRESH_COOKIE_NAME, result.refreshTokenPlain, refreshCookieOptions())
    .status(200)
    .json(result.body);
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  const result = await authService.refreshSession(raw, clientMeta(req));
  res
    .cookie(REFRESH_COOKIE_NAME, result.refreshTokenPlain, refreshCookieOptions())
    .status(200)
    .json(result.body);
}

export async function logout(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  await authService.logoutUser(raw);
  res
    .clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions())
    .status(204)
    .send();
}
