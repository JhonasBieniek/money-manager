import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import { getActiveSession } from "../services/conversation-session.service.js";
import { cancelActiveSession, finalizeWizardTagsStep } from "../services/expense-wizard.service.js";
import { dismissWizardReplyKeyboard } from "../services/wizard-keyboards.js";

function parseStartToken(text: string | undefined): string | null {
  if (!text) {
    return null;
  }
  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/);
  if (!match) {
    return null;
  }
  const token = match[1]?.trim().split(/\s+/, 1)[0];
  return token && token.length > 0 ? token : null;
}

function getStartTokenFromContext(ctx: Context): string | null {
  const match = (ctx as { match?: unknown }).match;
  if (typeof match === "string") {
    const token = match.trim().split(/\s+/, 1)[0];
    if (token) {
      return token;
    }
  }
  return parseStartToken(ctx.message?.text);
}

export function createHandleStart(internal: InternalApiClient) {
  return async function handleStart(ctx: Context): Promise<void> {
    const token = getStartTokenFromContext(ctx);
    if (!token) {
      await ctx.reply(
        'Para vincular sua conta, use o botão "Conectar Telegram" no site e envie aqui o comando que ele gerar (ex.: /start seguido do código).',
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
        "Não foi possível vincular. O código pode estar inválido, expirado ou já utilizado.",
      );
      return;
    }

    await ctx.reply(
      [
        "Conta vinculada.",
        "",
        "Use /help para ver como registrar despesas.",
      ].join("\n"),
    );
  };
}

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    [
      "Fluxo de cadastro",
      "",
      "1. Envie áudio, voz ou texto (ex.: 150 mercado)",
      "2. Categoria — escolha a meta",
      "3. Pagamento — padrão PIX; altere ou mantenha",
      "4. Cartão — apenas se escolher crédito",
      "5. Tags — opcional; adicione uma ou mais",
      "6. /finalizar — conclui e grava a despesa",
      "",
      "Toque nas opções do menu abaixo da mensagem ou responda com texto.",
      "",
      "/cancel — descarta o lançamento em andamento",
      "/finalizar — na etapa de tags, conclui o item atual",
    ].join("\n"),
  );
}

export function createHandleFinalize(internal: InternalApiClient) {
  return async function handleFinalize(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      await ctx.reply("Não foi possível identificar o chat.");
      return;
    }

    const session = await getActiveSession(internal, String(chatId));
    if (!session || session.pendingAction !== "tags") {
      await ctx.reply("Não há etapa de tags em andamento.");
      return;
    }

    const handled = await finalizeWizardTagsStep(ctx, internal, session);
    if (!handled) {
      await ctx.reply("Não foi possível finalizar agora. Tente novamente.");
    }
  };
}

export function createHandleCancel(internal: InternalApiClient) {
  return async function handleCancel(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) {
      await ctx.reply("Não foi possível identificar o chat.");
      return;
    }

    try {
      const activeSession = await getActiveSession(internal, String(chatId));
      await cancelActiveSession(internal, String(chatId));

      if (activeSession) {
        await ctx.reply("Operação cancelada.", {
          reply_markup: dismissWizardReplyKeyboard(),
        });
        return;
      }

      await ctx.reply("Não há lançamento em andamento.", {
        reply_markup: dismissWizardReplyKeyboard(),
      });
    } catch (error) {
      console.error("[bot] Falha ao cancelar sessão:", error);
      await ctx.reply("Não consegui cancelar o lançamento agora. Tente novamente.");
    }
  };
}
