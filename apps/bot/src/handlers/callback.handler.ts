import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";

export type CallbackHandlerEnv = {
  internal: InternalApiClient;
};

/** Botões inline antigos — o wizard usa teclado de resposta agora. */
export async function handleCallback(
  ctx: Context,
  _env: CallbackHandlerEnv,
): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("wz:")) {
    return false;
  }

  await ctx.answerCallbackQuery({
    text: "Use o menu de opções abaixo da mensagem.",
  });
  return true;
}
