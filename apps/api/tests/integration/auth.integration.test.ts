import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { REFRESH_COOKIE_NAME } from "../../src/modules/auth/auth.constants.js";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { hasSetCookie } from "../helpers/cookies.js";
import { primeCsrfAgent, withCsrfHeader } from "../helpers/csrf.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

describeWithDb("auth integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/auth/register retorna 201 com access token e cookie", async () => {
    const agent = request.agent(app);
    const csrf = await primeCsrfAgent(agent);
    const res = await withCsrfHeader(agent, csrf)
      .post("/v1/auth/register")
      .send({ email: "new@example.com", password: "12345678" });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Conta criada com sucesso");
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.tokenType).toBe("Bearer");
    expect(hasSetCookie(res.headers["set-cookie"], REFRESH_COOKIE_NAME)).toBe(
      true,
    );
  });

  it("POST /v1/auth/register com email duplicado retorna 409", async () => {
    const email = `taken-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

    const firstAgent = request.agent(app);
    const firstCsrf = await primeCsrfAgent(firstAgent);
    const first = await withCsrfHeader(firstAgent, firstCsrf)
      .post("/v1/auth/register")
      .send({ email, password: "12345678" });
    expect(first.status).toBe(201);

    const secondAgent = request.agent(app);
    const secondCsrf = await primeCsrfAgent(secondAgent);
    const res = await withCsrfHeader(secondAgent, secondCsrf)
      .post("/v1/auth/register")
      .send({ email, password: "87654321" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("POST /v1/auth/login válido retorna access token e cookie", async () => {
    const { email, password } = await registerUser(app);
    const agent = request.agent(app);
    const csrf = await primeCsrfAgent(agent);

    const res = await withCsrfHeader(agent, csrf)
      .post("/v1/auth/login")
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(hasSetCookie(res.headers["set-cookie"], REFRESH_COOKIE_NAME)).toBe(
      true,
    );
  });

  it("POST /v1/auth/login inválido retorna 401", async () => {
    await registerUser(app, "user@example.com");
    const agent = request.agent(app);
    const csrf = await primeCsrfAgent(agent);

    const res = await withCsrfHeader(agent, csrf)
      .post("/v1/auth/login")
      .send({ email: "user@example.com", password: "wrongpass" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Email/Senha incorreto");
  });

  it("POST /v1/auth/refresh rotaciona sessão com cookie válido", async () => {
    const { agent } = await registerUser(app);
    const csrf = await primeCsrfAgent(agent);

    const res = await withCsrfHeader(agent, csrf).post("/v1/auth/refresh");

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(hasSetCookie(res.headers["set-cookie"], REFRESH_COOKIE_NAME)).toBe(
      true,
    );
  });

  it("POST /v1/auth/refresh sem cookie retorna 401", async () => {
    const agent = request.agent(app);
    const csrf = await primeCsrfAgent(agent);
    const res = await withCsrfHeader(agent, csrf).post("/v1/auth/refresh");

    expect(res.status).toBe(401);
  });

  it("POST /v1/auth/logout revoga sessão e retorna 204", async () => {
    const { agent } = await registerUser(app);
    const csrf = await primeCsrfAgent(agent);

    const logoutRes = await withCsrfHeader(agent, csrf).post("/v1/auth/logout");
    expect(logoutRes.status).toBe(204);

    const refreshCsrf = await primeCsrfAgent(agent);
    const refreshRes = await withCsrfHeader(agent, refreshCsrf).post("/v1/auth/refresh");
    expect(refreshRes.status).toBe(401);
  });
});
