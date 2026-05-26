import type { Context } from "grammy";
import type { MessageSyncEnv } from "../services/message-sync.service.js";
import { runSyncForChat } from "../services/message-sync.service.js";
import { replyToTrigger } from "../utils/telegram-reply.js";

export async function handleSync(ctx: Context, env: MessageSyncEnv): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    await replyToTrigger(ctx, "Não foi possível identificar o chat.");
    return;
  }

  const linked = await env.internal.getJson(
    `/v1/internal/telegram/account?chatId=${encodeURIComponent(String(chatId))}`
  );
  if (!linked.ok) {
    await replyToTrigger(ctx, "Vincule sua conta primeiro com /start e o código do site.");
    return;
  }

  await replyToTrigger(ctx, "Sincronizando mensagens pendentes...");
  const summary = await runSyncForChat(ctx, env);
  await replyToTrigger(ctx, summary);
}
