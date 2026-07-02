import {
  getDb,
  telegramAccounts,
  telegramLinkTokens,
} from "@money-manager/db";
import type {
  InternalLinkBody,
  LinkTokenResponse,
  TelegramAccountResponse,
} from "@money-manager/types";
import { generateRefreshTokenPlain, newId } from "@money-manager/utils";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/app-error.js";

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

function getBotUsername(): string | null {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/^@/, "");
}

function buildBotDeepLink(token: string): string | null {
  const username = getBotUsername();
  if (!username) {
    return null;
  }
  return `https://t.me/${username}?start=${encodeURIComponent(token)}`;
}

export function getBotInfo(): {
  botUsername: string | null;
  botUrl: string | null;
} {
  const botUsername = getBotUsername();
  return {
    botUsername,
    botUrl: botUsername ? `https://t.me/${botUsername}` : null,
  };
}

function parseChatId(chatId: string): bigint {
  try {
    return BigInt(chatId);
  } catch {
    throw new BadRequestError("chatId inválido");
  }
}

export async function createLinkToken(
  userId: string,
): Promise<LinkTokenResponse> {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MS);
  const token = generateRefreshTokenPlain();

  await db
    .delete(telegramLinkTokens)
    .where(
      and(eq(telegramLinkTokens.userId, userId), isNull(telegramLinkTokens.usedAt)),
    );

  await db.insert(telegramLinkTokens).values({
    id: newId(),
    userId,
    token,
    expiresAt,
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    startCommand: `/start ${token}`,
    botUsername: getBotUsername(),
    botDeepLink: buildBotDeepLink(token),
  };
}

export async function linkAccount(input: InternalLinkBody): Promise<void> {
  const db = getDb();
  const now = new Date();
  const chatId = parseChatId(input.chatId);

  const [tokenRow] = await db
    .select()
    .from(telegramLinkTokens)
    .where(
      and(
        eq(telegramLinkTokens.token, input.token),
        isNull(telegramLinkTokens.usedAt),
        gt(telegramLinkTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!tokenRow) {
    throw new NotFoundError("Token inválido ou expirado");
  }

  await db.transaction(async (tx) => {
    const [existingForUser] = await tx
      .select({ id: telegramAccounts.id })
      .from(telegramAccounts)
      .where(
        and(
          eq(telegramAccounts.userId, tokenRow.userId),
          isNull(telegramAccounts.revokedAt),
        ),
      )
      .limit(1);

    if (existingForUser) {
      throw new ConflictError("Usuário já possui conta Telegram vinculada");
    }

    const [existingForChat] = await tx
      .select({ id: telegramAccounts.id, userId: telegramAccounts.userId })
      .from(telegramAccounts)
      .where(
        and(
          eq(telegramAccounts.chatId, chatId),
          isNull(telegramAccounts.revokedAt),
        ),
      )
      .limit(1);

    if (existingForChat) {
      throw new ConflictError("chat_id já vinculado a outra conta");
    }

    await tx.insert(telegramAccounts).values({
      id: newId(),
      userId: tokenRow.userId,
      chatId,
      username: input.username ?? null,
      linkedAt: now,
    });

    await tx
      .update(telegramLinkTokens)
      .set({ usedAt: now })
      .where(eq(telegramLinkTokens.id, tokenRow.id));
  });
}

export async function getAccountByChatId(
  chatIdInput: string,
): Promise<TelegramAccountResponse> {
  const chatId = parseChatId(chatIdInput);

  const [row] = await getDb()
    .select()
    .from(telegramAccounts)
    .where(
      and(
        eq(telegramAccounts.chatId, chatId),
        isNull(telegramAccounts.revokedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError();
  }

  return {
    userId: row.userId,
    chatId: String(row.chatId),
    username: row.username,
    linkedAt: row.linkedAt.toISOString(),
  };
}

export async function getAccountByUserId(
  userId: string,
): Promise<TelegramAccountResponse | null> {
  const [row] = await getDb()
    .select()
    .from(telegramAccounts)
    .where(
      and(
        eq(telegramAccounts.userId, userId),
        isNull(telegramAccounts.revokedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    userId: row.userId,
    chatId: String(row.chatId),
    username: row.username,
    linkedAt: row.linkedAt.toISOString(),
  };
}
