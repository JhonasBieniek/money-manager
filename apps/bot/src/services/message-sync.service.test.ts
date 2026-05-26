import { describe, expect, it } from "vitest";
import { buildBotExpenseRequest } from "./message-sync.service.js";

describe("buildBotExpenseRequest", () => {
  const record = {
    chatId: "123",
    telegramMessageId: "456",
    messageAt: "2025-05-20T14:30:00.000Z",
  };

  it("usa messageAt como occurredAt da despesa", () => {
    const body = buildBotExpenseRequest(record, 0, {
      amount: 40,
      description: "manga",
    });

    expect(body).toMatchObject({
      amount: 40,
      description: "manga",
      occurredAt: "2025-05-20T14:30:00.000Z",
      paymentMethodIndex: 1,
      source: "telegram_voice",
      idempotencyKey: "tg:123:456:0",
    });
  });

  it("retorna null quando item incompleto", () => {
    expect(buildBotExpenseRequest(record, 0, { description: "sem valor" })).toBeNull();
  });
});
