import type { Context } from "grammy";
import {
  processVoiceMessage,
  recordInboundMessage,
  type MessageSyncEnv,
} from "../services/message-sync.service.js";
import { replyToTrigger } from "../utils/telegram-reply.js";

export type VoiceHandlerEnv = MessageSyncEnv;

export async function handleVoice(
  ctx: Context,
  env: VoiceHandlerEnv
): Promise<void> {
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

  const hasAudio = ctx.message?.voice ?? ctx.message?.audio;
  if (!hasAudio) {
    await replyToTrigger(ctx, "Não foi possível ler o áudio.");
    return;
  }

  const record = await recordInboundMessage(ctx, env.internal);
  if (!record) {
    await replyToTrigger(ctx, "Falha ao registrar a mensagem.");
    return;
  }

  const result = await processVoiceMessage(ctx, record, env);
  await replyToTrigger(ctx, result.summary);
}
