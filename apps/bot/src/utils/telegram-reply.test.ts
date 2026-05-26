import { describe, expect, it, vi } from "vitest";
import { getTriggerMessageId, replyToTrigger } from "./telegram-reply.js";

describe("telegram-reply", () => {
  it("getTriggerMessageId lê message_id do update", () => {
    const ctx = { msg: { message_id: 42 } } as Parameters<typeof getTriggerMessageId>[0];
    expect(getTriggerMessageId(ctx)).toBe(42);
  });

  it("replyToTrigger envia reply_parameters com a mensagem de origem", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      msg: { message_id: 99 },
      reply,
    } as unknown as Parameters<typeof replyToTrigger>[0];

    await replyToTrigger(ctx, "Inseridas 1 despesa(s)");

    expect(reply).toHaveBeenCalledWith("Inseridas 1 despesa(s)", {
      reply_parameters: { message_id: 99 },
    });
  });

  it("replyToTrigger sem message_id usa reply simples", async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    const ctx = { reply } as unknown as Parameters<typeof replyToTrigger>[0];

    await replyToTrigger(ctx, "ok");

    expect(reply).toHaveBeenCalledWith("ok");
  });
});
