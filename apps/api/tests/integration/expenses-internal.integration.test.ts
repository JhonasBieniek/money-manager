import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

const INTERNAL_API_KEY = "dev-internal-key-change-me";

describeWithDb("expenses internal integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  async function linkChat(accessToken: string, chatId: string) {
    const tokenRes = await request(app)
      .post("/v1/telegram/link-token")
      .set("Authorization", `Bearer ${accessToken}`);

    await request(app)
      .post("/v1/internal/telegram/link")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({ token: tokenRes.body.token, chatId });
  }

  it("cria despesa via bot com source telegram_whisper", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);
    const chatId = "777888999";
    await linkChat(accessToken, chatId);

    const res = await request(app)
      .post("/v1/internal/expenses")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({
        chatId,
        amount: 42.5,
        description: "almoço",
        idempotencyKey: "tg:777888999:1:0",
        source: "telegram_whisper",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it("é idempotente por userId + idempotencyKey", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);
    const chatId = "111222333";
    await linkChat(accessToken, chatId);

    const payload = {
      chatId,
      amount: 10,
      description: "café",
      idempotencyKey: "tg:111222333:2:0",
      source: "telegram_whisper",
    };

    const first = await request(app)
      .post("/v1/internal/expenses")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send(payload);

    const second = await request(app)
      .post("/v1/internal/expenses")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it("permite goalCategory nulo para despesas do bot", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);
    const chatId = "444555666";
    await linkChat(accessToken, chatId);

    const res = await request(app)
      .post("/v1/internal/expenses")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({
        chatId,
        amount: 25,
        description: "uber",
        idempotencyKey: "tg:444555666:3:0",
        source: "telegram_whisper",
      });

    expect(res.status).toBe(201);

    const list = await request(app)
      .get("/v1/expenses")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(list.status).toBe(200);
    const expense = list.body.items.find(
      (item: { id: string }) => item.id === res.body.id,
    );
    expect(expense).toBeDefined();
    expect(expense.goalCategory).toBeNull();
    expect(expense.source).toBe("telegram_whisper");
  });

  it("rejeita sem x-internal-api-key", async () => {
    const res = await request(app)
      .post("/v1/internal/expenses")
      .send({
        chatId: "1",
        amount: 10,
        description: "teste",
        idempotencyKey: "x",
        source: "telegram_whisper",
      });

    expect(res.status).toBe(401);
  });
});
