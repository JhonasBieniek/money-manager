import {
  db,
  telegramAccounts,
  telegramLinkTokens,
} from "@money-manager/db";
import { newId } from "@money-manager/utils";
import { and, eq, isNull, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error.js";

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

export async function createTelegramLinkToken(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);

  await db.insert(telegramLinkTokens).values({
    id: newId(),
    userId,
    token,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function linkTelegramAccount(input: {
  token: string;
  chatId: string;
  username?: string;
}): Promise<void> {
  const chatIdBig = BigInt(input.chatId);

  await db.transaction(async (tx) => {
    const now = new Date();

    const [row] = await tx
      .select()
      .from(telegramLinkTokens)
      .where(
        and(
          eq(telegramLinkTokens.token, input.token),
          isNull(telegramLinkTokens.usedAt),
          gt(telegramLinkTokens.expiresAt, now)
        )
      )
      .for("update")
      .limit(1);

    if (!row) {
      throw new NotFoundError();
    }

    const [existingUserAccount] = await tx
      .select({ id: telegramAccounts.id })
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, row.userId))
      .limit(1);

    if (existingUserAccount) {
      throw new ConflictError();
    }

    const [existingChatAccount] = await tx
      .select({ userId: telegramAccounts.userId })
      .from(telegramAccounts)
      .where(eq(telegramAccounts.chatId, chatIdBig))
      .limit(1);

    if (existingChatAccount && existingChatAccount.userId !== row.userId) {
      throw new ConflictError();
    }

    await tx.insert(telegramAccounts).values({
      id: newId(),
      userId: row.userId,
      chatId: chatIdBig,
      username: input.username ?? null,
    });

    await tx
      .update(telegramLinkTokens)
      .set({ usedAt: now })
      .where(eq(telegramLinkTokens.id, row.id));
  });
}

export async function findUserIdByTelegramChatId(
  chatId: string
): Promise<string | null> {
  const chatIdBig = BigInt(chatId);
  const [row] = await db
    .select({ userId: telegramAccounts.userId })
    .from(telegramAccounts)
    .where(eq(telegramAccounts.chatId, chatIdBig))
    .limit(1);

  return row?.userId ?? null;
}
