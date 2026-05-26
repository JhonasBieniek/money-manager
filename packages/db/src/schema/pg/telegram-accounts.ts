import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const telegramAccounts = pgTable(
  "telegram_accounts",
  {
    id: uuid("id").primaryKey(),
    chatId: bigint("chat_id", { mode: "bigint" }).notNull().unique(),
    username: text("username"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("telegram_accounts_chat_id_idx").on(t.chatId)]
);

