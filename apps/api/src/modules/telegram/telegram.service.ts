import { db, telegramAccounts } from "@money-manager/db";
import { newId } from "@money-manager/utils";
import { and, eq, isNull } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error.js";

function readLinkCode(): string {
  const code = process.env.TELEGRAM_LINK_CODE;
  if (!code) {
    throw new Error("TELEGRAM_LINK_CODE is required for Telegram linking");
  }
  return code;
}

function parseChatId(chatId: string): bigint | number {
  const provider = process.env.DB_PROVIDER === "supabase" ? "supabase" : "sqlite";
  if (provider === "supabase") {
    return BigInt(chatId);
  }
  return Number(chatId);
}

export function getTelegramLinkHint(): { startCommand: string } {
  const code = readLinkCode();
  return { startCommand: `/start ${code}` };
}

export async function linkTelegramAccount(input: {
  token: string;
  chatId: string;
  username?: string;
}): Promise<void> {
  const expected = readLinkCode();
  if (input.token !== expected) {
    throw new NotFoundError();
  }

  const chatIdValue = parseChatId(input.chatId);
  const now = new Date();

  await db.transaction(async (tx) => {
    const active = await tx
      .select()
      .from(telegramAccounts)
      .where(isNull(telegramAccounts.revokedAt));

    const existingForChat = active.find(
      (a) => String(a.chatId) === String(chatIdValue)
    );

    if (existingForChat) {
      return;
    }

    if (active.length > 0) {
      throw new ConflictError();
    }

    await tx.insert(telegramAccounts).values({
      id: newId(),
      chatId: chatIdValue as never,
      username: input.username ?? null,
      linkedAt: now,
    });
  });
}

export async function isTelegramChatLinked(chatId: string): Promise<boolean> {
  const chatIdValue = parseChatId(chatId);
  const [row] = await db
    .select({ id: telegramAccounts.id })
    .from(telegramAccounts)
    .where(
      and(
        eq(telegramAccounts.chatId, chatIdValue as never),
        isNull(telegramAccounts.revokedAt)
      )
    )
    .limit(1);

  return Boolean(row);
}
