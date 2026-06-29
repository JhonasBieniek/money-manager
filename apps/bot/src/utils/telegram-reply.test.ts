import { describe, expect, it } from "@jest/globals";
import { getTriggerMessageId } from "./telegram-reply.js";

describe("getTriggerMessageId", () => {
  it("retorna message_id do contexto", () => {
    const ctx = {
      msg: { message_id: 42 },
    };
    expect(getTriggerMessageId(ctx as never)).toBe(42);
  });

  it("retorna undefined sem mensagem", () => {
    expect(getTriggerMessageId({} as never)).toBeUndefined();
  });
});
