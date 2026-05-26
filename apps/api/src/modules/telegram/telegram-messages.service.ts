import { db, telegramInboundMessages, type ParsedExpenseItem } from "@money-manager/db";
import { newId } from "@money-manager/utils";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";
import type {
  PatchInboundMessageBody,
  RecordInboundMessageBody,
} from "./telegram-messages.schema.js";

function parseChatId(chatId: string): bigint | number {
  const provider = process.env.DB_PROVIDER === "supabase" ? "supabase" : "sqlite";
  if (provider === "supabase") {
    return BigInt(chatId);
  }
  return Number(chatId);
}

function parseTelegramId(value: string): bigint | number {
  const provider = process.env.DB_PROVIDER === "supabase" ? "supabase" : "sqlite";
  if (provider === "supabase") {
    return BigInt(value);
  }
  return Number(value);
}

function serializeJson<T>(value: T | undefined | null): string | T | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const provider = process.env.DB_PROVIDER === "supabase" ? "supabase" : "sqlite";
  if (provider === "supabase") {
    return value;
  }
  return JSON.stringify(value);
}

function deserializeJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}

export type InboundMessageDto = {
  id: string;
  chatId: string;
  telegramMessageId: string;
  telegramUpdateId: string;
  kind: "voice" | "audio" | "photo";
  fileId: string | null;
  transcription: string | null;
  parsedItems: ParsedExpenseItem[] | null;
  status: "pending" | "synced" | "failed" | "partial";
  syncError: string | null;
  expenseIds: string[] | null;
  messageAt: Date;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapRow(row: typeof telegramInboundMessages.$inferSelect): InboundMessageDto {
  return {
    id: row.id,
    chatId: String(row.chatId),
    telegramMessageId: String(row.telegramMessageId),
    telegramUpdateId: String(row.telegramUpdateId),
    kind: row.kind as InboundMessageDto["kind"],
    fileId: row.fileId ?? null,
    transcription: row.transcription ?? null,
    parsedItems: deserializeJson<ParsedExpenseItem[]>(row.parsedItems),
    status: row.status as InboundMessageDto["status"],
    syncError: row.syncError ?? null,
    expenseIds: deserializeJson<string[]>(row.expenseIds),
    messageAt: row.messageAt instanceof Date ? row.messageAt : new Date(row.messageAt),
    syncedAt: row.syncedAt
      ? row.syncedAt instanceof Date
        ? row.syncedAt
        : new Date(row.syncedAt)
      : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

export async function recordInboundMessage(
  input: RecordInboundMessageBody
): Promise<InboundMessageDto> {
  const chatId = parseChatId(input.chatId);
  const telegramMessageId = parseTelegramId(input.telegramMessageId);
  const telegramUpdateId = parseTelegramId(input.telegramUpdateId);
  const messageAt = new Date(input.messageAt);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(telegramInboundMessages)
    .where(
      and(
        eq(telegramInboundMessages.chatId, chatId as never),
        eq(telegramInboundMessages.telegramMessageId, telegramMessageId as never)
      )
    )
    .limit(1);

  if (existing) {
    return mapRow(existing);
  }

  const id = newId();
  const inserted = (await db
    .insert(telegramInboundMessages)
    .values({
      id,
      chatId: chatId as never,
      telegramMessageId: telegramMessageId as never,
      telegramUpdateId: telegramUpdateId as never,
      kind: input.kind,
      fileId: input.fileId ?? null,
      status: "pending",
      messageAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning()) as (typeof telegramInboundMessages.$inferSelect)[];

  const row = inserted[0];
  if (!row) {
    throw new Error("Falha ao registrar mensagem");
  }
  return mapRow(row);
}

export async function patchInboundMessage(
  messageId: string,
  input: PatchInboundMessageBody
): Promise<InboundMessageDto> {
  const [existing] = await db
    .select()
    .from(telegramInboundMessages)
    .where(eq(telegramInboundMessages.id, messageId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Message not found");
  }

  const now = new Date();
  const values: Record<string, unknown> = { updatedAt: now };

  if (input.transcription !== undefined) {
    values.transcription = input.transcription;
  }
  if (input.parsedItems !== undefined) {
    values.parsedItems = serializeJson(input.parsedItems);
  }
  if (input.status !== undefined) {
    values.status = input.status;
  }
  if (input.syncError !== undefined) {
    values.syncError = input.syncError;
  }
  if (input.expenseIds !== undefined) {
    values.expenseIds = serializeJson(input.expenseIds);
  }
  if (input.syncedAt !== undefined) {
    values.syncedAt = input.syncedAt ? new Date(input.syncedAt) : null;
  }

  const updated = (await db
    .update(telegramInboundMessages)
    .set(values as never)
    .where(eq(telegramInboundMessages.id, messageId))
    .returning()) as (typeof telegramInboundMessages.$inferSelect)[];

  const row = updated[0];
  if (!row) {
    throw new NotFoundError("Message not found");
  }
  return mapRow(row);
}

export async function listPendingInboundMessages(
  chatId: string
): Promise<InboundMessageDto[]> {
  const chatIdValue = parseChatId(chatId);
  const rows = await db
    .select()
    .from(telegramInboundMessages)
    .where(
      and(
        eq(telegramInboundMessages.chatId, chatIdValue as never),
        inArray(telegramInboundMessages.status, ["pending", "failed", "partial"])
      )
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
  const rows = await db
    .select({
      status: telegramInboundMessages.status,
      count: sql<number>`count(*)`,
    })
    .from(telegramInboundMessages)
    .where(eq(telegramInboundMessages.chatId, chatIdValue as never))
    .groupBy(telegramInboundMessages.status);

  const counts = { pending: 0, synced: 0, failed: 0, partial: 0 };
  for (const row of rows) {
    const key = row.status as keyof typeof counts;
    if (key in counts) {
      counts[key] = Number(row.count);
    }
  }

  const [lastSynced] = await db
    .select({ telegramMessageId: telegramInboundMessages.telegramMessageId })
    .from(telegramInboundMessages)
    .where(
      and(
        eq(telegramInboundMessages.chatId, chatIdValue as never),
        eq(telegramInboundMessages.status, "synced")
      )
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
