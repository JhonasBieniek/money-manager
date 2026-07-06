import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import {
  fetchBotContext,
  getActiveSession,
} from "../services/conversation-session.service.js";
import {
  buildDraftExpenseItem,
  handleWizardInput,
  isLikelyNewLaunch,
  patchesToCreateFields,
  startWizardWithDrafts,
} from "../services/expense-wizard.service.js";
import {
  hasStructuredLines,
  parseExpenseText,
} from "../services/parse-expense-text.js";
import {
  parseExpenseUtterances,
  type ExpenseUtteranceItem,
} from "../services/parse-expense-utterance.js";
import { resolveGoalCategory } from "../services/resolve-goal-category.js";

export type TextHandlerEnv = {
  internal: InternalApiClient;
};

function isItemComplete(item: ExpenseUtteranceItem): boolean {
  return item.amount !== undefined && Boolean(item.description);
}

async function recordTextInbound(
  ctx: Context,
  internal: InternalApiClient,
): Promise<void> {
  const chatId = ctx.chat?.id;
  const message = ctx.message;
  if (chatId === undefined || !message?.text) {
    return;
  }

  await internal.postJson("/v1/internal/telegram/messages", {
    chatId: String(chatId),
    telegramMessageId: String(message.message_id),
    telegramUpdateId: String(ctx.update.update_id),
    kind: "text",
    messageAt: new Date(message.date * 1000).toISOString(),
    transcription: message.text,
  });
}

export async function handleText(
  ctx: Context,
  env: TextHandlerEnv,
): Promise<void> {
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text?.trim();
  if (chatId === undefined || !text || text.startsWith("/")) {
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

  const session = await getActiveSession(env.internal, String(chatId));
  if (
    session &&
    session.pendingAction !== "none" &&
    !isLikelyNewLaunch(text)
  ) {
    await handleWizardInput(ctx, env.internal, session, text);
    return;
  }

  await recordTextInbound(ctx, env.internal);
  const context = await fetchBotContext(env.internal, String(chatId));
  if (!context) {
    await ctx.reply("Falha ao carregar contexto do usuário.");
    return;
  }

  if (hasStructuredLines(text)) {
    const structured = parseExpenseText(text);
    const fields = patchesToCreateFields(structured.patches, context);
    if (!fields.amount || !fields.description) {
      await ctx.reply(
        "Para criar com *, envie pelo menos:\n*valor\n*descrição",
      );
      return;
    }
    await startWizardWithDrafts(ctx, env.internal, {
      chatId: String(chatId),
      triggerMessageId: String(ctx.message!.message_id),
      draftItems: [
        buildDraftExpenseItem({
          amount: fields.amount,
          description: fields.description,
          goalCategory: fields.goalCategory,
          paymentMethod: fields.paymentMethod,
          tagIds: fields.tagIds,
          occurredAt: new Date(ctx.message!.date * 1000).toISOString(),
          source: "telegram_manual",
        }),
      ],
      replacedPrevious: Boolean(session),
    });
    return;
  }

  const parsed = parseExpenseUtterances(text);
  const items = parsed.items.filter(isItemComplete);
  if (items.length === 0) {
    await ctx.reply(
      'Não entendi. Ex.: "150 mercado" ou linhas com * (veja /help).',
    );
    return;
  }

  const draftItems = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    let goalCategory = undefined;
    const hint = resolveGoalCategory(item.description ?? "", context);
    if (hint.ok) {
      goalCategory = hint.category;
    }
    draftItems.push(
      buildDraftExpenseItem({
        amount: item.amount!,
        description: item.description!,
        goalCategory,
        paymentMethod: item.paymentMethod,
        occurredAt: new Date(ctx.message!.date * 1000).toISOString(),
        source: "telegram_manual",
      }),
    );
  }

  await startWizardWithDrafts(ctx, env.internal, {
    chatId: String(chatId),
    triggerMessageId: String(ctx.message!.message_id),
    draftItems,
    replacedPrevious: Boolean(session),
  });
}
