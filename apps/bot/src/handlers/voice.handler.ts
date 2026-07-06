import type { Context } from "grammy";
import {
  processVoiceMessage,
  recordInboundMessage,
  type MessageSyncEnv,
} from "../services/message-sync.service.js";
import { getActiveSession } from "../services/conversation-session.service.js";
import {
  buildDraftExpenseItem,
  startWizardWithDrafts,
} from "../services/expense-wizard.service.js";
import { scheduleInboundRetry } from "../services/inbound-retry.service.js";
import { fetchBotContext } from "../services/conversation-session.service.js";
import { resolveGoalCategory } from "../services/resolve-goal-category.js";

export type VoiceHandlerEnv = MessageSyncEnv;

export async function handleVoice(
  ctx: Context,
  env: VoiceHandlerEnv,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    await ctx.reply("Não foi possível identificar o chat.");
    return;
  }

  const linked = await env.internal.getJson(
    `/v1/internal/telegram/account?chatId=${encodeURIComponent(String(chatId))}`,
  );
  if (!linked.ok) {
    await ctx.reply(
      "Vincule sua conta primeiro com /start e o código do site.",
    );
    return;
  }

  const hasAudio = ctx.message?.voice ?? ctx.message?.audio;
  if (!hasAudio) {
    await ctx.reply("Não foi possível ler o áudio.");
    return;
  }

  const existingSession = await getActiveSession(env.internal, String(chatId));
  const record = await recordInboundMessage(ctx, env.internal);
  if (!record) {
    await ctx.reply("Falha ao registrar a mensagem.");
    return;
  }

  const result = await processVoiceMessage(ctx, record, env);

  if (result.status === "failed" && result.items.length === 0) {
    if (
      result.syncError === "Falha no download do Telegram" ||
      result.syncError === "Falha na transcrição STT"
    ) {
      await scheduleInboundRetry(
        ctx.api,
        { ...record, retryCount: record.retryCount ?? 0 },
        env,
        record.retryCount ?? 0,
      );
    }
    await ctx.reply(result.summary);
    return;
  }

  if (result.items.length === 0) {
    await ctx.reply(result.summary);
    return;
  }

  const context = await fetchBotContext(env.internal, String(chatId));
  if (!context) {
    await ctx.reply("Falha ao carregar contexto do usuário.");
    return;
  }

  const draftItems = result.items
    .filter((item) => item.amount !== undefined && item.description)
    .map((item) => {
      const resolved = resolveGoalCategory(item.description ?? "", context);
      return buildDraftExpenseItem({
        amount: item.amount!,
        description: item.description!,
        goalCategory: resolved.ok ? resolved.category : null,
        paymentMethod: item.paymentMethod,
        occurredAt: record.messageAt,
        source: "telegram_whisper",
      });
    });

  await startWizardWithDrafts(ctx, env.internal, {
    chatId: String(chatId),
    triggerMessageId: String(ctx.message!.message_id),
    draftItems,
    replacedPrevious: Boolean(existingSession),
  });
}
