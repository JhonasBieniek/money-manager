import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const telegramAccounts = sqliteTable(
  "telegram_accounts",
  {
    id: text("id").primaryKey(),
    chatId: integer("chat_id").notNull().unique(),
    username: text("username"),
    linkedAt: integer("linked_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    chatIdx: index("telegram_accounts_chat_id_idx").on(t.chatId),
  })
);

