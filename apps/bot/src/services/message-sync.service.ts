import type { Api, Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import { downloadTelegramFile } from "../utils/telegram-file.js";
import {
  replyToChatMessage,
} from "../utils/telegram-reply.js";
import {
  parseExpenseUtterances,
  type ExpenseUtteranceItem,
} from "./parse-expense-utterance.js";
import { runSttOnAudioBytes, type SttResult } from "./stt.service.js";

export type InboundMessageRecord = {
  id: string;
  chatId: string;
  telegramMessageId: string;
  kind: "voice" | "audio";
  fileId: string | null;
  transcription: string | null;
  parsedItems: ExpenseUtteranceItem[] | null;
  status: string;
  messageAt: string;
};

export function buildBotExpenseRequest(
  record: Pick<InboundMessageRecord, "chatId" | "telegramMessageId" | "messageAt">,
  itemIndex: number,
  item: ExpenseUtteranceItem,
): Record<string, unknown> | null {
  if (item.amount === undefined || !item.description) {
    return null;
  }

  return {
    chatId: record.chatId,
    amount: item.amount,
    description: item.description,
    paymentMethodIndex: BOT_PAYMENT_METHOD_INDEX,
    occurredAt: record.messageAt,
    idempotencyKey: `tg:${record.chatId}:${record.telegramMessageId}:${itemIndex}`,
    source: "telegram_whisper",
  };
}

export type MessageSyncEnv = {
  sttServiceUrl: string;
  internal: InternalApiClient;
};

const BOT_PAYMENT_METHOD_INDEX = 2;
const LOW_LANGUAGE_CONFIDENCE = 0.6;

function resolveAudioFromContext(ctx: Context): {
  fileId: string;
  filename: string;
  kind: "voice" | "audio";
} | null {
  const voice = ctx.message?.voice;
  if (voice?.file_id) {
    return { fileId: voice.file_id, filename: "voice.ogg", kind: "voice" };
  }
  const audio = ctx.message?.audio;
  if (audio?.file_id) {
    return {
      fileId: audio.file_id,
      filename: audio.file_name ?? "audio.mp3",
      kind: "audio",
    };
  }
  return null;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isItemComplete(item: ExpenseUtteranceItem): boolean {
  return item.amount !== undefined && Boolean(item.description);
}

export function formatInsertSummary(
  inserted: Array<{ amount: number; description: string }>,
  errors: string[],
): string {
  const lines: string[] = [];
  if (inserted.length > 0) {
    lines.push(`Inseridas ${inserted.length} despesa(s):`);
    for (const row of inserted) {
      lines.push(`• ${formatMoney(row.amount)} — ${row.description}`);
    }
    lines.push("Meta: pendente (atribua no site)");
  }
  if (errors.length > 0) {
    lines.push(`Erros (${errors.length}):`);
    for (const err of errors.slice(0, 5)) {
      lines.push(`• ${err}`);
    }
  }
  if (lines.length === 0) {
    return "Nenhuma despesa identificada no áudio.";
  }
  return lines.join("\n");
}

export function formatLowConfidenceMessage(): string {
  return [
    "Não consegui entender o áudio com confiança suficiente.",
    "Reenvie um áudio mais claro ou cadastre a despesa no site.",
  ].join("\n");
}

export function formatSyncSummary(stats: {
  messagesProcessed: number;
  expensesCreated: number;
  errors: string[];
}): string {
  const lines = [
    `Sync: ${stats.messagesProcessed} mensagem(ns), ${stats.expensesCreated} despesa(s).`,
    stats.errors.length === 0 ? "0 erros." : `${stats.errors.length} erro(s).`,
  ];
  if (stats.errors.length > 0) {
    for (const err of stats.errors.slice(0, 5)) {
      lines.push(`• ${err}`);
    }
  }
  return lines.join("\n");
}

export async function recordInboundMessage(
  ctx: Context,
  internal: InternalApiClient,
): Promise<InboundMessageRecord | null> {
  const chatId = ctx.chat?.id;
  const message = ctx.message;
  const audio = resolveAudioFromContext(ctx);
  if (chatId === undefined || !message || !audio) {
    return null;
  }

  const res = await internal.postJson("/v1/internal/telegram/messages", {
    chatId: String(chatId),
    telegramMessageId: String(message.message_id),
    telegramUpdateId: String(ctx.update.update_id),
    kind: audio.kind,
    fileId: audio.fileId,
    messageAt: new Date(message.date * 1000).toISOString(),
  });

  if (!res.ok) {
    return null;
  }
  return (await res.json()) as InboundMessageRecord;
}

async function patchMessage(
  internal: InternalApiClient,
  messageId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await internal.patchJson(`/v1/internal/telegram/messages/${messageId}`, body);
}

async function createExpenseFromItem(
  internal: InternalApiClient,
  record: Pick<InboundMessageRecord, "chatId" | "telegramMessageId" | "messageAt">,
  itemIndex: number,
  item: ExpenseUtteranceItem,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const payload = buildBotExpenseRequest(record, itemIndex, item);
  if (!payload) {
    return { ok: false, error: "Valor ou descrição ausente" };
  }

  const res = await internal.postJson("/v1/internal/expenses", payload);

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const created = (await res.json()) as { id: string };
  return { ok: true, id: created.id };
}

type TranscribeFailureStage = "download" | "stt";

type TranscribeOutcome =
  | { ok: true; stt: SttResult }
  | { ok: false; stage: TranscribeFailureStage };

async function transcribeRecord(
  api: Api,
  record: InboundMessageRecord,
  sttServiceUrl: string,
): Promise<TranscribeOutcome | null> {
  if (!record.fileId) {
    return null;
  }
  const filename = record.kind === "voice" ? "voice.ogg" : "audio.mp3";

  let audioBytes: Buffer;
  try {
    audioBytes = await downloadTelegramFile(api, record.fileId);
  } catch (err) {
    console.error("[telegram] Falha no download do áudio:", err);
    return { ok: false, stage: "download" };
  }

  try {
    const stt = await runSttOnAudioBytes(audioBytes, sttServiceUrl, filename);
    return { ok: true, stt };
  } catch (err) {
    console.error("[stt] Falha na transcrição:", err);
    return { ok: false, stage: "stt" };
  }
}

export async function processInboundRecord(
  api: Api,
  record: InboundMessageRecord,
  env: MessageSyncEnv,
): Promise<{ summary: string; expenseIds: string[]; status: "synced" | "partial" | "failed" }> {
  let transcription = record.transcription;
  let stt: SttResult | null = null;

  if (!transcription) {
    const transcribeOutcome = await transcribeRecord(api, record, env.sttServiceUrl);
    if (!transcribeOutcome) {
      await patchMessage(env.internal, record.id, {
        status: "failed",
        syncError: "Arquivo de áudio ausente",
      });
      return {
        summary: "Não foi possível processar o áudio.",
        expenseIds: [],
        status: "failed",
      };
    }
    if (!transcribeOutcome.ok) {
      const syncError =
        transcribeOutcome.stage === "download"
          ? "Falha no download do Telegram"
          : "Falha na transcrição STT";
      const summary =
        transcribeOutcome.stage === "download"
          ? "Falha ao baixar o áudio do Telegram. Tente reenviar em instantes."
          : "Falha ao transcrever o áudio.";
      await patchMessage(env.internal, record.id, {
        status: "failed",
        syncError,
      });
      return {
        summary,
        expenseIds: [],
        status: "failed",
      };
    }
    stt = transcribeOutcome.stt;
    transcription = stt.full_text;
  }

  if (stt && stt.language_probability < LOW_LANGUAGE_CONFIDENCE) {
    await patchMessage(env.internal, record.id, {
      transcription,
      status: "failed",
      syncError: "Confiança de idioma baixa",
    });
    return {
      summary: formatLowConfidenceMessage(),
      expenseIds: [],
      status: "failed",
    };
  }

  const parsed = parseExpenseUtterances(transcription);
  const completeItems = parsed.items.filter(isItemComplete);
  const incompleteCount = parsed.items.length - completeItems.length;

  if (parsed.items.length === 0 || completeItems.length === 0) {
    await patchMessage(env.internal, record.id, {
      transcription,
      parsedItems: parsed.items,
      status: "failed",
      syncError: "Nenhum item completo no parse",
    });
    return {
      summary: formatLowConfidenceMessage(),
      expenseIds: [],
      status: "failed",
    };
  }

  const inserted: Array<{ amount: number; description: string }> = [];
  const expenseIds: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i]!;
    if (!isItemComplete(item)) {
      errors.push(`Item ${i + 1}: valor ou descrição ausente`);
      continue;
    }
    const result = await createExpenseFromItem(env.internal, record, i, item);
    if (result.ok) {
      expenseIds.push(result.id);
      if (item.amount !== undefined && item.description) {
        inserted.push({ amount: item.amount, description: item.description });
      }
    } else {
      errors.push(result.error);
    }
  }

  const status =
    inserted.length === 0 ? "failed" : errors.length > 0 ? "partial" : "synced";

  await patchMessage(env.internal, record.id, {
    transcription,
    parsedItems: parsed.items,
    status,
    syncError:
      errors.length > 0
        ? errors.join("; ")
        : incompleteCount > 0
          ? `${incompleteCount} item(ns) incompleto(s)`
          : null,
    expenseIds,
    syncedAt: status === "failed" ? null : new Date().toISOString(),
  });

  let summary = formatInsertSummary(inserted, errors);
  if (status === "failed" && inserted.length === 0) {
    summary = formatLowConfidenceMessage();
  }

  return {
    summary,
    expenseIds,
    status,
  };
}

export async function processVoiceMessage(
  ctx: Context,
  record: InboundMessageRecord,
  env: MessageSyncEnv,
): Promise<{ summary: string; expenseIds: string[]; status: "synced" | "partial" | "failed" }> {
  return processInboundRecord(ctx.api, record, env);
}

export async function runSyncForChat(
  ctx: Context,
  env: MessageSyncEnv,
): Promise<string> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    return "Não foi possível identificar o chat.";
  }

  const res = await env.internal.getJson(
    `/v1/internal/telegram/messages/pending?chatId=${encodeURIComponent(String(chatId))}`,
  );
  if (!res.ok) {
    return "Falha ao buscar mensagens pendentes.";
  }

  const body = (await res.json()) as { items: InboundMessageRecord[] };
  const pending = body.items ?? [];

  if (pending.length === 0) {
    return "Nenhuma mensagem pendente para sincronizar.";
  }

  let messagesProcessed = 0;
  let expensesCreated = 0;
  const errors: string[] = [];

  for (const record of pending) {
    const result = await processInboundRecord(ctx.api, record, env);
    messagesProcessed += 1;
    expensesCreated += result.expenseIds.length;
    await replyToChatMessage(ctx, record.telegramMessageId, result.summary);
    if (result.status === "failed") {
      errors.push(`Msg ${record.telegramMessageId}: falha`);
    }
  }

  return formatSyncSummary({ messagesProcessed, expensesCreated, errors });
}
