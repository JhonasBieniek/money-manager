import type { Api, Context } from "grammy";
import type { InternalApiClient } from "../api/internal.client.js";
import {
  parseExpenseUtterances,
  type ExpenseUtteranceItem,
} from "./parse-expense-utterance.js";
import { replyToChatMessage } from "../utils/telegram-reply.js";
import { runSttOnAudioBytes, type SttResult } from "./stt.service.js";

export type InboundMessageRecord = {
  id: string;
  chatId: string;
  telegramMessageId: string;
  kind: "voice" | "audio" | "photo";
  fileId: string | null;
  transcription: string | null;
  parsedItems: ExpenseUtteranceItem[] | null;
  status: string;
  /** ISO — data/hora em que a mensagem foi enviada no Telegram */
  messageAt: string;
};

export function buildBotExpenseRequest(
  record: Pick<InboundMessageRecord, "chatId" | "telegramMessageId" | "messageAt">,
  itemIndex: number,
  item: ExpenseUtteranceItem
): Record<string, unknown> | null {
  if (item.amount === undefined || !item.description) {
    return null;
  }

  return {
    amount: item.amount,
    description: item.description,
    paymentMethodIndex: BOT_PAYMENT_METHOD_INDEX,
    occurredAt: record.messageAt,
    idempotencyKey: `tg:${record.chatId}:${record.telegramMessageId}:${itemIndex}`,
    source: "telegram_voice",
  };
}

export type MessageSyncEnv = {
  sttServiceUrl: string;
  internal: InternalApiClient;
};

/** Despesas via bot são sempre lançadas como cartão de crédito. */
const BOT_PAYMENT_METHOD_INDEX = 1;

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
    return { fileId: audio.file_id, filename: audio.file_name ?? "audio.mp3", kind: "audio" };
  }
  return null;
}

async function downloadFile(api: Api, fileId: string): Promise<Buffer> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram file path missing");
  }
  const url = `https://api.telegram.org/file/bot${api.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Telegram file: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatInsertSummary(
  inserted: Array<{ amount: number; description: string }>,
  errors: string[]
): string {
  const lines: string[] = [];
  if (inserted.length > 0) {
    lines.push(`Inseridas ${inserted.length} despesa(s):`);
    for (const row of inserted) {
      lines.push(`• ${formatMoney(row.amount)} — ${row.description}`);
    }
    lines.push("Categoria: pendente (atribua no site)");
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
  internal: InternalApiClient
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
  body: Record<string, unknown>
): Promise<void> {
  await internal.patchJson(`/v1/internal/telegram/messages/${messageId}`, body);
}

async function createExpenseFromItem(
  internal: InternalApiClient,
  record: Pick<InboundMessageRecord, "chatId" | "telegramMessageId" | "messageAt">,
  itemIndex: number,
  item: ExpenseUtteranceItem
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

async function transcribeRecord(
  api: Api,
  record: InboundMessageRecord,
  sttServiceUrl: string
): Promise<SttResult | null> {
  if (!record.fileId) {
    return null;
  }
  const filename = record.kind === "voice" ? "voice.ogg" : "audio.mp3";
  try {
    const buf = await downloadFile(api, record.fileId);
    return await runSttOnAudioBytes(buf, sttServiceUrl, filename);
  } catch {
    return null;
  }
}

export async function processInboundRecord(
  api: Api,
  record: InboundMessageRecord,
  env: MessageSyncEnv
): Promise<{ summary: string; expenseIds: string[]; status: "synced" | "partial" | "failed" }> {
  if (record.kind === "photo") {
    return {
      summary: "Fotos ainda não suportadas no sync.",
      expenseIds: [],
      status: "failed",
    };
  }

  let transcription = record.transcription;
  let stt: SttResult | null = null;

  if (!transcription) {
    stt = await transcribeRecord(api, record, env.sttServiceUrl);
    if (!stt) {
      await patchMessage(env.internal, record.id, {
        status: "failed",
        syncError: "Falha na transcrição",
      });
      return {
        summary: "Falha ao transcrever o áudio.",
        expenseIds: [],
        status: "failed",
      };
    }
    transcription = stt.full_text;
  }

  const parsed = parseExpenseUtterances(transcription);
  const inserted: Array<{ amount: number; description: string }> = [];
  const expenseIds: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i]!;
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
    syncError: errors.length > 0 ? errors.join("; ") : null,
    expenseIds,
    syncedAt: status === "failed" ? null : new Date().toISOString(),
  });

  return {
    summary: formatInsertSummary(inserted, errors),
    expenseIds,
    status,
  };
}

export async function processVoiceMessage(
  ctx: Context,
  record: InboundMessageRecord,
  env: MessageSyncEnv
): Promise<{ summary: string; expenseIds: string[]; status: "synced" | "partial" | "failed" }> {
  return processInboundRecord(ctx.api, record, env);
}

export async function runSyncForChat(
  ctx: Context,
  env: MessageSyncEnv
): Promise<string> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    return "Não foi possível identificar o chat.";
  }

  const res = await env.internal.getJson(
    `/v1/internal/telegram/messages/pending?chatId=${encodeURIComponent(String(chatId))}`
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
