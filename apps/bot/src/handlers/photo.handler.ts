import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import { runOcrOnImageBytes } from "../services/ocr.service.js";
import { parseBankNotification } from "../services/parser.service.js";
import { downloadTelegramFile } from "../utils/telegram-file.js";

export type PhotoHandlerEnv = {
  ocrServiceUrl: string;
  internal: InternalApiClient;
};

export async function handlePhoto(
  ctx: Context,
  env: PhotoHandlerEnv
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    await ctx.reply("Não foi possível identificar o chat.");
    return;
  }

  const linked = await env.internal.getJson(
    `/v1/internal/telegram/account?chatId=${encodeURIComponent(String(chatId))}`
  );
  if (!linked.ok) {
    await ctx.reply("Vincule sua conta primeiro com /start e o código do site.");
    return;
  }

  const photos = ctx.message?.photo;
  if (!photos?.length) {
    await ctx.reply("Não foi possível ler a foto.");
    return;
  }

  const fileId = photos[photos.length - 1]?.file_id;
  if (!fileId) {
    await ctx.reply("Arquivo inválido.");
    return;
  }

  let buf: Buffer;
  try {
    buf = await downloadTelegramFile(ctx, fileId);
  } catch {
    await ctx.reply("Falha ao baixar imagem do Telegram.");
    return;
  }
  const ocr = await runOcrOnImageBytes(buf, env.ocrServiceUrl);
  const parsed = parseBankNotification(ocr.full_text);

  await ctx.reply(
    `OCR (confiança ${ocr.confidence.toFixed(2)}): ${ocr.full_text.slice(0, 500) || "(vazio)"}\nParse stub: ${JSON.stringify(parsed)}`
  );
}
