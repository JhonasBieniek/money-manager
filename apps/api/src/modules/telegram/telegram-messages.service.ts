import {
  getDb,
  telegramInboundMessages,
  type ParsedExpenseItem,
} from "@money-manager/db";
import { newId } from "@money-manager/utils";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";
import type {
  PatchInboundMessageBody,
  RecordInboundMessageBody,
} from "./telegram-messages.schema.js";

function parseChatId(chatId: string): bigint {
  return BigInt(chatId);
}

function parseTelegramId(value: string): bigint {
  return BigInt(value);
}

export type InboundMessageDto = {
  id: string;
  chatId: string;
  telegramMessageId: string;
  telegramUpdateId: string;
  kind: "voice" | "audio" | "text";
  fileId: string | null;
  transcription: string | null;
  parsedItems: ParsedExpenseItem[] | null;
  status: "pending" | "synced" | "failed" | "partial";
  syncError: string | null;
  expenseIds: string[] | null;
  messageAt: Date;
  syncedAt: Date | null;
  retryCount: number;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapRow(
  row: typeof telegramInboundMessages.$inferSelect,
): InboundMessageDto {
  return {
    id: row.id,
    chatId: String(row.chatId),
    telegramMessageId: String(row.telegramMessageId),
    telegramUpdateId: String(row.telegramUpdateId),
    kind: row.kind as InboundMessageDto["kind"],
    fileId: row.fileId ?? null,
    transcription: row.transcription ?? null,
    parsedItems: row.parsedItems ?? null,
    status: row.status as InboundMessageDto["status"],
    syncError: row.syncError ?? null,
    expenseIds: row.expenseIds ?? null,
    messageAt: row.messageAt,
    syncedAt: row.syncedAt ?? null,
    retryCount: row.retryCount,
    nextRetryAt: row.nextRetryAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function recordInboundMessage(
  input: RecordInboundMessageBody,
): Promise<InboundMessageDto> {
  const chatId = parseChatId(input.chatId);
  const telegramMessageId = parseTelegramId(input.telegramMessageId);
  const telegramUpdateId = parseTelegramId(input.telegramUpdateId);
  const messageAt = new Date(input.messageAt);
  const now = new Date();

  const [existing] = await getDb()
    .select()
    .from(telegramInboundMessages)
    .where(
      and(
        eq(telegramInboundMessages.chatId, chatId),
        eq(telegramInboundMessages.telegramMessageId, telegramMessageId),
      ),
    )
    .limit(1);

  if (existing) {
    return mapRow(existing);
  }

  const id = newId();
  const [row] = await getDb()
    .insert(telegramInboundMessages)
    .values({
      id,
      chatId,
      telegramMessageId,
      telegramUpdateId,
      kind: input.kind,
      fileId: input.fileId ?? null,
      transcription: input.transcription ?? null,
      status: "pending",
      messageAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Falha ao registrar mensagem");
  }
  return mapRow(row);
}

export async function patchInboundMessage(
  messageId: string,
  input: PatchInboundMessageBody,
): Promise<InboundMessageDto> {
  const [existing] = await getDb()
    .select()
    .from(telegramInboundMessages)
    .where(eq(telegramInboundMessages.id, messageId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Message not found");
  }

  const now = new Date();
  const values: Partial<typeof telegramInboundMessages.$inferInsert> = {
    updatedAt: now,
  };

  if (input.transcription !== undefined) {
    values.transcription = input.transcription;
  }
  if (input.parsedItems !== undefined) {
    values.parsedItems = input.parsedItems;
  }
  if (input.status !== undefined) {
    values.status = input.status;
  }
  if (input.syncError !== undefined) {
    values.syncError = input.syncError;
  }
  if (input.expenseIds !== undefined) {
    values.expenseIds = input.expenseIds;
  }
  if (input.syncedAt !== undefined) {
    values.syncedAt = input.syncedAt ? new Date(input.syncedAt) : null;
  }
  if (input.retryCount !== undefined) {
    values.retryCount = input.retryCount;
  }
  if (input.nextRetryAt !== undefined) {
    values.nextRetryAt = input.nextRetryAt ? new Date(input.nextRetryAt) : null;
  }

  const [row] = await getDb()
    .update(telegramInboundMessages)
    .set(values)
    .where(eq(telegramInboundMessages.id, messageId))
    .returning();

  if (!row) {
    throw new NotFoundError("Message not found");
  }
  return mapRow(row);
}

export async function listPendingInboundMessages(
  chatId: string,
): Promise<InboundMessageDto[]> {
  const chatIdValue = parseChatId(chatId);
  const rows = await getDb()
    .select()
    .from(telegramInboundMessages)
    .where(
      and(
        eq(telegramInboundMessages.chatId, chatIdValue),
        inArray(telegramInboundMessages.status, ["pending", "failed", "partial"]),
      ),
    )
    .orderBy(asc(telegramInboundMessages.telegramMessageId));

  return rows.map(mapRow);
}

export async function getInboundMessagesStatus(chatId: string): Promise<{
  pending: number;
  synced: number;
  failed: number;
  partial: number;
  lastSyncedMessageId: string | null;
}> {
  const chatIdValue = parseChatId(chatId);
  const rows = await getDb()
    .select({
      status: telegramInboundMessages.status,
      count: sql<number>`count(*)`,
    })
    .from(telegramInboundMessages)
    .where(eq(telegramInboundMessages.chatId, chatIdValue))
    .groupBy(telegramInboundMessages.status);

  const counts = { pending: 0, synced: 0, failed: 0, partial: 0 };
  for (const row of rows) {
    const key = row.status as keyof typeof counts;
    if (key in counts) {
      counts[key] = Number(row.count);
    }
  }

  const [lastSynced] = await getDb()
    .select({ telegramMessageId: telegramInboundMessages.telegramMessageId })
    .from(telegramInboundMessages)
    .where(
      and(
        eq(telegramInboundMessages.chatId, chatIdValue),
        eq(telegramInboundMessages.status, "synced"),
      ),
    )
    .orderBy(desc(telegramInboundMessages.telegramMessageId))
    .limit(1);

  return {
    ...counts,
    lastSyncedMessageId: lastSynced
      ? String(lastSynced.telegramMessageId)
      : null,
  };
}

const RECOVERABLE_SYNC_ERRORS = new Set([
  "Falha no download do Telegram",
  "Falha na transcrição STT",
]);

export async function listRetryEligibleInboundMessages(input: {
  maxAgeHours: number;
  limit: number;
}): Promise<InboundMessageDto[]> {
  const minMessageAt = new Date(Date.now() - input.maxAgeHours * 60 * 60 * 1000);
  const now = new Date();

  const rows = await getDb()
    .select()
    .from(telegramInboundMessages)
    .where(
      and(
        gte(telegramInboundMessages.messageAt, minMessageAt),
        inArray(telegramInboundMessages.status, ["pending", "failed"]),
        sql`${telegramInboundMessages.retryCount} < 3`,
        or(
          sql`${telegramInboundMessages.nextRetryAt} IS NULL`,
          lte(telegramInboundMessages.nextRetryAt, now),
        ),
      ),
    )
    .orderBy(asc(telegramInboundMessages.messageAt))
    .limit(input.limit);

  return rows
    .filter((row) => {
      if (row.status === "pending" && !row.transcription) {
        return true;
      }
      if (!row.syncError) {
        return false;
      }
      return RECOVERABLE_SYNC_ERRORS.has(row.syncError);
    })
    .map(mapRow);
}
