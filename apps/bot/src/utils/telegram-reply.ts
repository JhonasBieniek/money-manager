import type { Context } from "grammy";

export function getTriggerMessageId(ctx: Context): number | undefined {
  return ctx.msg?.message_id;
}

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

export async function replyToChatMessage(
  ctx: Context,
  telegramMessageId: string,
  text: string,
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
