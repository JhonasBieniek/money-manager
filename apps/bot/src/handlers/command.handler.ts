import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";

function parseStartToken(text: string | undefined): string | null {
  if (!text) {
    return null;
  }
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== "/start") {
    return null;
  }
  const token = parts[1];
  return token && token.length > 0 ? token : null;
}

export function createHandleStart(internal: InternalApiClient) {
  return async function handleStart(ctx: Context): Promise<void> {
    const token = parseStartToken(ctx.message?.text);
    if (!token) {
      await ctx.reply(
        "Para vincular sua conta, use o botão \"Conectar Telegram\" no site e envie aqui o comando que ele gerar (ex.: /start seguido do código)."
      );
      return;
    }

    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      await ctx.reply("Não foi possível identificar o chat.");
      return;
    }

    const username = ctx.from?.username;
    const res = await internal.postJson("/v1/internal/telegram/link", {
      token,
      chatId: String(chatId),
      ...(username !== undefined ? { username } : {}),
    });

    if (!res.ok) {
      await ctx.reply(
        "Não foi possível vincular. O código pode estar inválido, expirado ou já utilizado."
      );
      return;
    }

    await ctx.reply("Conta vinculada.");
  };
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    "Comandos: /start <código> (vincular conta), /help, /cancel. Envie uma foto de comprovante depois de vinculado."
  );
}

export async function handleCancel(ctx: Context): Promise<void> {
  await ctx.reply("Operação cancelada.");
}
