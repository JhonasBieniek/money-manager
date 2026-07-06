import {
  getDb,
  type DraftExpenseItem,
  telegramBotSessions,
  type SessionItemMeta,
} from "@money-manager/db";
import { newId } from "@money-manager/utils";
import type { TelegramBotSession } from "@money-manager/types";
import { and, eq, gt } from "drizzle-orm";
import { NotFoundError } from "../../shared/errors/app-error.js";
import { getAccountByChatId } from "./telegram.service.js";
import type {
  CreateBotSessionBody,
  PatchBotSessionBody,
} from "./telegram-sessions.schema.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function parseChatId(chatId: string): bigint {
  return BigInt(chatId);
}

function parseOptionalTelegramId(value: string | undefined): bigint | null {
  return value !== undefined ? BigInt(value) : null;
}

function mapSession(
  row: typeof telegramBotSessions.$inferSelect,
): TelegramBotSession {
  return {
    id: row.id,
    chatId: String(row.chatId),
    userId: row.userId,
    confirmationMessageId: row.confirmationMessageId
      ? String(row.confirmationMessageId)
      : null,
    triggerMessageId: row.triggerMessageId
      ? String(row.triggerMessageId)
      : null,
    expenseIds: row.expenseIds,
    draftItems: row.draftItems as TelegramBotSession["draftItems"],
    pendingAction: row.pendingAction,
    pendingItemIndex: row.pendingItemIndex,
    itemMeta: row.itemMeta,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getActiveSessionByChat(
  chatId: string,
): Promise<TelegramBotSession | null> {
  const chatIdValue = parseChatId(chatId);
  const now = new Date();
  const [row] = await getDb()
    .select()
    .from(telegramBotSessions)
    .where(
      and(
        eq(telegramBotSessions.chatId, chatIdValue),
        gt(telegramBotSessions.expiresAt, now),
      ),
    )
    .limit(1);

  return row ? mapSession(row) : null;
}

export async function getSessionByConfirmationMessage(
  chatId: string,
  confirmationMessageId: string,
): Promise<TelegramBotSession | null> {
  const chatIdValue = parseChatId(chatId);
  const messageId = BigInt(confirmationMessageId);
  const now = new Date();
  const [row] = await getDb()
    .select()
    .from(telegramBotSessions)
    .where(
      and(
        eq(telegramBotSessions.chatId, chatIdValue),
        eq(telegramBotSessions.confirmationMessageId, messageId),
        eq(telegramBotSessions.pendingAction, "none"),
        gt(telegramBotSessions.expiresAt, now),
      ),
    )
    .limit(1);

  return row ? mapSession(row) : null;
}

export async function createOrReplaceSession(
  input: CreateBotSessionBody,
): Promise<{ session: TelegramBotSession; replacedPrevious: boolean }> {
  const account = await getAccountByChatId(input.chatId);
  const chatIdValue = parseChatId(input.chatId);
  const now = new Date();
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(now.getTime() + SESSION_TTL_MS);

  const [existing] = await getDb()
    .select({ id: telegramBotSessions.id })
    .from(telegramBotSessions)
    .where(eq(telegramBotSessions.chatId, chatIdValue))
    .limit(1);

  const replacedPrevious = Boolean(existing);

  if (existing) {
    await getDb()
      .delete(telegramBotSessions)
      .where(eq(telegramBotSessions.id, existing.id));
  }

  const id = newId();
  const [row] = await getDb()
    .insert(telegramBotSessions)
    .values({
      id,
      chatId: chatIdValue,
      userId: account.userId,
      triggerMessageId: parseOptionalTelegramId(input.triggerMessageId),
      expenseIds: input.expenseIds ?? [],
      draftItems: input.draftItems as DraftExpenseItem[],
      pendingAction: input.pendingAction,
      pendingItemIndex: input.pendingItemIndex ?? 0,
      itemMeta: input.itemMeta as SessionItemMeta[],
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Falha ao criar sessão");
  }

  return { session: mapSession(row), replacedPrevious };
}

export async function patchSession(
  sessionId: string,
  input: PatchBotSessionBody,
): Promise<TelegramBotSession> {
  const now = new Date();
  const values: Partial<typeof telegramBotSessions.$inferInsert> = {
    updatedAt: now,
  };

  if (input.confirmationMessageId !== undefined) {
    values.confirmationMessageId = input.confirmationMessageId
      ? BigInt(input.confirmationMessageId)
      : null;
  }
  if (input.expenseIds !== undefined) {
    values.expenseIds = input.expenseIds;
  }
  if (input.draftItems !== undefined) {
    values.draftItems = input.draftItems as DraftExpenseItem[];
  }
  if (input.pendingAction !== undefined) {
    values.pendingAction = input.pendingAction;
  }
  if (input.pendingItemIndex !== undefined) {
    values.pendingItemIndex = input.pendingItemIndex;
  }
  if (input.itemMeta !== undefined) {
    values.itemMeta = input.itemMeta;
  }
  if (input.expiresAt !== undefined) {
    values.expiresAt = new Date(input.expiresAt);
  } else {
    values.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  }

  const [row] = await getDb()
    .update(telegramBotSessions)
    .set(values)
    .where(eq(telegramBotSessions.id, sessionId))
    .returning();

  if (!row) {
    throw new NotFoundError("Sessão não encontrada");
  }

  return mapSession(row);
}

export async function deleteSessionByChat(chatId: string): Promise<void> {
  const chatIdValue = parseChatId(chatId);
  await getDb()
    .delete(telegramBotSessions)
    .where(eq(telegramBotSessions.chatId, chatIdValue));
}
