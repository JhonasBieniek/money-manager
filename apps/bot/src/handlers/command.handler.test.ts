import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const cancelActiveSessionMock = jest.fn();
const finalizeWizardTagsStepMock = jest.fn();

jest.unstable_mockModule("../services/expense-wizard.service.js", () => ({
  cancelActiveSession: cancelActiveSessionMock,
  finalizeWizardTagsStep: finalizeWizardTagsStepMock,
}));

const { createHandleStart } = await import("./command.handler.js");

describe("createHandleStart", () => {
  beforeEach(() => {
    cancelActiveSessionMock.mockReset();
  });

  it("usa o payload do comando quando o deep link chega como /start", async () => {
    const postJson = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
    } as Response);
    const handleStart = createHandleStart({
      postJson,
    } as never);
    const reply = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await handleStart({
      match: "secure-link-token-abc123",
      message: { text: "/start" },
      chat: { id: 987654321 },
      from: { username: "tester" },
      reply,
    } as never);

    expect(postJson).toHaveBeenCalledWith("/v1/internal/telegram/link", {
      token: "secure-link-token-abc123",
      chatId: "987654321",
      username: "tester",
    });
    expect(reply).toHaveBeenCalledWith(
      "Conta vinculada.\n\nUse /help para ver como registrar despesas.",
    );
  });

  it("mantém fallback para token vindo no texto da mensagem", async () => {
    const postJson = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
    } as Response);
    const handleStart = createHandleStart({
      postJson,
    } as never);
    const reply = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await handleStart({
      message: { text: "/start secure-link-token-xyz" },
      chat: { id: 12345 },
      from: {},
      reply,
    } as never);

    expect(postJson).toHaveBeenCalledWith("/v1/internal/telegram/link", {
      token: "secure-link-token-xyz",
      chatId: "12345",
    });
    expect(reply).toHaveBeenCalledWith(
      "Conta vinculada.\n\nUse /help para ver como registrar despesas.",
    );
  });

  it("responde com orientação quando não há token", async () => {
    const postJson = jest.fn<typeof fetch>();
    const handleStart = createHandleStart({
      postJson,
    } as never);
    const reply = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await handleStart({
      message: { text: "/start" },
      reply,
    } as never);

    expect(postJson).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      'Para vincular sua conta, use o botão "Conectar Telegram" no site e envie aqui o comando que ele gerar (ex.: /start seguido do código).',
    );
  });
});
