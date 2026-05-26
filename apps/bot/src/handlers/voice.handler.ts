import type { Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import { parseExpenseUtterance } from "../services/parse-expense-utterance.js";
import { runSttOnAudioBytes } from "../services/stt.service.js";
import { downloadTelegramFile } from "../utils/telegram-file.js";

export type VoiceHandlerEnv = {
  sttServiceUrl: string;
  internal: InternalApiClient;
};

function resolveAudioFile(ctx: Context): { fileId: string; filename: string } | null {
  const voice = ctx.message?.voice;
  if (voice?.file_id) {
    return { fileId: voice.file_id, filename: "voice.ogg" };
  }
  const audio = ctx.message?.audio;
  if (audio?.file_id) {
    const name = audio.file_name ?? "audio.mp3";
    return { fileId: audio.file_id, filename: name };
  }
  return null;
}

export function formatVoiceDebugReply(
  stt: Awaited<ReturnType<typeof runSttOnAudioBytes>>,
  parsed: ReturnType<typeof parseExpenseUtterance>
): string {
  const noiseLabel = stt.noise_reduction_applied ? "sim" : "não";
  const duration = stt.duration_seconds.toFixed(1);
  const lang = stt.language ?? "?";
  const transcription = stt.full_text.slice(0, 500) || "(vazio)";
  return [
    `STT (${lang}, ${duration}s, ruído: ${noiseLabel})`,
    `Transcrição: ${transcription}`,
    `Parse: ${JSON.stringify(parsed)}`,
  ].join("\n");
}

export async function handleVoice(
  ctx: Context,
  env: VoiceHandlerEnv
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

  const audioFile = resolveAudioFile(ctx);
  if (!audioFile) {
    await ctx.reply("Não foi possível ler o áudio.");
    return;
  }

  try {
    const buf = await downloadTelegramFile(ctx, audioFile.fileId);
    const stt = await runSttOnAudioBytes(buf, env.sttServiceUrl, audioFile.filename);
    const parsed = parseExpenseUtterance(stt.full_text);
    await ctx.reply(formatVoiceDebugReply(stt, parsed));
  } catch {
    await ctx.reply("Falha ao transcrever o áudio. Tente novamente.");
  }
}
