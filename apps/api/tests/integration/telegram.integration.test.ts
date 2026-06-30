import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

const INTERNAL_API_KEY = "dev-internal-key-change-me";

describeWithDb("telegram integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("POST /v1/telegram/link-token retorna 401 sem auth", async () => {
    const res = await request(app).post("/v1/telegram/link-token");
    expect(res.status).toBe(401);
  });

  it("fluxo completo de vínculo via API interna", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);

    const tokenRes = await request(app)
      .post("/v1/telegram/link-token")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.token).toBeDefined();
    expect(tokenRes.body.startCommand).toBe(`/start ${tokenRes.body.token}`);
    expect(tokenRes.body.expiresAt).toBeDefined();

    const chatId = "987654321";

    const linkRes = await request(app)
      .post("/v1/internal/telegram/link")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({
        token: tokenRes.body.token,
        chatId,
        username: "integration_user",
      });

    expect(linkRes.status).toBe(204);

    const accountRes = await request(app)
      .get(`/v1/internal/telegram/account?chatId=${chatId}`)
      .set("x-internal-api-key", INTERNAL_API_KEY);

    expect(accountRes.status).toBe(200);
    expect(accountRes.body.chatId).toBe(chatId);
    expect(accountRes.body.username).toBe("integration_user");
    expect(accountRes.body.linkedAt).toBeDefined();
    expect(accountRes.body.userId).toBeDefined();

    const userAccountRes = await request(app)
      .get("/v1/telegram/account")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(userAccountRes.status).toBe(200);
    expect(userAccountRes.body.chatId).toBe(chatId);
    expect(userAccountRes.body.linkedAt).toBeDefined();
  });

  it("GET /v1/telegram/account retorna 404 sem vínculo", async () => {
    const { accessToken } = await registerUser(app);

    const res = await request(app)
      .get("/v1/telegram/account")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it("rejeita internal API sem x-internal-api-key", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;

    const res = await request(app)
      .post("/v1/internal/telegram/link")
      .send({ token: "x", chatId: "1" });

    expect(res.status).toBe(401);
  });

  it("rejeita reutilização do mesmo token", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);

    const tokenRes = await request(app)
      .post("/v1/telegram/link-token")
      .set("Authorization", `Bearer ${accessToken}`);

    const chatId = "111222333";

    const first = await request(app)
      .post("/v1/internal/telegram/link")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({ token: tokenRes.body.token, chatId });

    expect(first.status).toBe(204);

    const second = await request(app)
      .post("/v1/internal/telegram/link")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({ token: tokenRes.body.token, chatId: "444555666" });

    expect(second.status).toBe(404);
  });

  it("rejeita chat_id duplicado para outro usuário", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const user1 = await registerUser(app);
    const user2 = await registerUser(app);
    const chatId = "555666777";

    const token1 = await request(app)
      .post("/v1/telegram/link-token")
      .set("Authorization", `Bearer ${user1.accessToken}`);

    await request(app)
      .post("/v1/internal/telegram/link")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({ token: token1.body.token, chatId });

    const token2 = await request(app)
      .post("/v1/telegram/link-token")
      .set("Authorization", `Bearer ${user2.accessToken}`);

    const conflict = await request(app)
      .post("/v1/internal/telegram/link")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({ token: token2.body.token, chatId });

    expect(conflict.status).toBe(409);
  });
});
