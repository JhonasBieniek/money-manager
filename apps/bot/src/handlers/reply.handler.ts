import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import { getActiveSession } from "../services/conversation-session.service.js";
import {
  applyReplyPatches,
  formatFinalConfirmation,
} from "../services/expense-wizard.service.js";
import { fetchBotContext } from "../services/conversation-session.service.js";

export type ReplyHandlerEnv = {
  internal: InternalApiClient;
};

export async function handleReply(
  ctx: Context,
  env: ReplyHandlerEnv,
): Promise<boolean> {
  const chatId = ctx.chat?.id;
  const message = ctx.message;
  const replyTo = message?.reply_to_message;
  if (chatId === undefined || !message?.text || !replyTo) {
    return false;
  }

  const session = await getActiveSession(env.internal, String(chatId));
  if (
    !session ||
    session.pendingAction !== "none" ||
    !session.confirmationMessageId ||
    String(replyTo.message_id) !== session.confirmationMessageId
  ) {
    return false;
  }

  if (session.expenseIds.length === 0 || session.draftItems.length === 0) {
    await ctx.reply("Sessão expirada. Envie a despesa novamente.");
    return true;
  }

  const { error, draftItems } = await applyReplyPatches(
    env.internal,
    session,
    message.text,
  );
  if (error) {
    await ctx.reply(error);
    return true;
  }

  const context = await fetchBotContext(env.internal, String(chatId));
  if (!context) {
    await ctx.reply("Falha ao carregar contexto.");
    return true;
  }

  await ctx.reply(formatFinalConfirmation(draftItems, context));
  return true;
}
