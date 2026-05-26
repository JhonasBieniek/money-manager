import type { Context } from "grammy";

/** ID da mensagem que disparou o update (voz, foto, comando, etc.). */
export function getTriggerMessageId(ctx: Context): number | undefined {
  return ctx.msg?.message_id;
}

/** Responde no chat citando a mensagem do usuário que gerou o handler. */
export async function replyToTrigger(ctx: Context, text: string): Promise<void> {
  const messageId = getTriggerMessageId(ctx);
  if (messageId === undefined) {
    await ctx.reply(text);
    return;
  }

  await ctx.reply(text, {
    reply_parameters: { message_id: messageId },
  });
}

/** Envia resposta citando outra mensagem do mesmo chat (ex.: sync de pendente antigo). */
export async function replyToChatMessage(
  ctx: Context,
  telegramMessageId: string,
  text: string
): Promise<void> {
  const chatId = ctx.chat?.id;
  const messageId = Number(telegramMessageId);
  if (chatId === undefined || !Number.isFinite(messageId)) {
    await ctx.reply(text);
    return;
  }

  await ctx.api.sendMessage(chatId, text, {
    reply_parameters: { message_id: messageId },
  });
}
