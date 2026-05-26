import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import { runOcrOnImageBytes } from "../services/ocr.service.js";
import { parseBankNotification } from "../services/parser.service.js";

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

  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const imageRes = await fetch(url);
  if (!imageRes.ok) {
    await ctx.reply("Falha ao baixar imagem do Telegram.");
    return;
  }

  const buf = Buffer.from(await imageRes.arrayBuffer());
  const ocr = await runOcrOnImageBytes(buf, env.ocrServiceUrl);
  const parsed = parseBankNotification(ocr.full_text);

  await ctx.reply(
    `OCR (confiança ${ocr.confidence.toFixed(2)}): ${ocr.full_text.slice(0, 500) || "(vazio)"}\nParse stub: ${JSON.stringify(parsed)}`
  );
}
