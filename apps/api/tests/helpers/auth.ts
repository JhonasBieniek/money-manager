import type { Express } from "express";
import request, { type SuperAgentTest } from "supertest";
import { primeCsrfAgent, withCsrfHeader } from "./csrf.js";

export type AuthSession = {
  agent: SuperAgentTest;
  email: string;
  password: string;
  accessToken: string;
};

export async function registerUser(
  app: Express,
  email?: string,
  password = "12345678",
): Promise<AuthSession> {
  const uniqueEmail =
    email ??
    `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const agent = request.agent(app);
  const csrf = await primeCsrfAgent(agent);
  const res = await withCsrfHeader(agent, csrf)
    .post("/v1/auth/register")
    .send({ email: uniqueEmail, password });

  return {
    agent,
    email: uniqueEmail,
    password,
    accessToken: res.body.accessToken as string,
  };
}
