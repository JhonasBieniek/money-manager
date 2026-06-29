import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/app.js";
import { registerUser } from "../helpers/auth.js";
import { describeWithDb, useIntegrationDbLifecycle } from "../helpers/db.js";

const INTERNAL_API_KEY = "dev-internal-key-change-me";

async function linkTelegramAccount(
  app: ReturnType<typeof createTestApp>,
  accessToken: string,
  chatId: string,
) {
  const tokenRes = await request(app)
    .post("/v1/telegram/link-token")
    .set("Authorization", `Bearer ${accessToken}`);

  await request(app)
    .post("/v1/internal/telegram/link")
    .set("x-internal-api-key", INTERNAL_API_KEY)
    .send({ token: tokenRes.body.token, chatId });

  return tokenRes.body;
}

describeWithDb("telegram messages integration", () => {
  const app = createTestApp();

  useIntegrationDbLifecycle();

  it("registra mensagem inbound de forma idempotente", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);
    const chatId = "123456789";
    await linkTelegramAccount(app, accessToken, chatId);

    const payload = {
      chatId,
      telegramMessageId: "100",
      telegramUpdateId: "9001",
      kind: "voice",
      fileId: "file-abc",
      messageAt: "2025-06-01T12:00:00.000Z",
    };

    const first = await request(app)
      .post("/v1/internal/telegram/messages")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send(payload);

    expect(first.status).toBe(201);
    expect(first.body.id).toBeDefined();
    expect(first.body.status).toBe("pending");

    const second = await request(app)
      .post("/v1/internal/telegram/messages")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send(payload);

    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it("atualiza mensagem e lista pendentes", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);
    const chatId = "222333444";
    await linkTelegramAccount(app, accessToken, chatId);

    const created = await request(app)
      .post("/v1/internal/telegram/messages")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({
        chatId,
        telegramMessageId: "200",
        telegramUpdateId: "9002",
        kind: "audio",
        messageAt: "2025-06-01T13:00:00.000Z",
      });

    const patched = await request(app)
      .patch(`/v1/internal/telegram/messages/${created.body.id}`)
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({
        transcription: "40 reais em manga",
        status: "failed",
        syncError: "parse incompleto",
      });

    expect(patched.status).toBe(200);
    expect(patched.body.transcription).toBe("40 reais em manga");
    expect(patched.body.status).toBe("failed");

    const pending = await request(app)
      .get(`/v1/internal/telegram/messages/pending?chatId=${chatId}`)
      .set("x-internal-api-key", INTERNAL_API_KEY);

    expect(pending.status).toBe(200);
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0].id).toBe(created.body.id);
  });

  it("retorna status agregado das mensagens", async () => {
    process.env.INTERNAL_API_KEY = INTERNAL_API_KEY;
    const { accessToken } = await registerUser(app);
    const chatId = "333444555";
    await linkTelegramAccount(app, accessToken, chatId);

    const created = await request(app)
      .post("/v1/internal/telegram/messages")
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({
        chatId,
        telegramMessageId: "300",
        telegramUpdateId: "9003",
        kind: "voice",
        messageAt: "2025-06-01T14:00:00.000Z",
      });

    await request(app)
      .patch(`/v1/internal/telegram/messages/${created.body.id}`)
      .set("x-internal-api-key", INTERNAL_API_KEY)
      .send({ status: "synced", syncedAt: "2025-06-01T14:05:00.000Z" });

    const statusRes = await request(app)
      .get(`/v1/internal/telegram/messages/status?chatId=${chatId}`)
      .set("x-internal-api-key", INTERNAL_API_KEY);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.synced).toBe(1);
    expect(statusRes.body.lastSyncedMessageId).toBe("300");
  });
});
