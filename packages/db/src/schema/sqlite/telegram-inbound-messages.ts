import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export type ParsedExpenseItem = {
  amount?: number;
  description?: string;
  paymentMethod?: string;
};

export const telegramInboundKindValues = ["voice", "audio", "photo"] as const;
export const telegramInboundStatusValues = [
  "pending",
  "synced",
  "failed",
  "partial",
] as const;

export const telegramInboundMessages = sqliteTable(
  "telegram_inbound_messages",
  {
    id: text("id").primaryKey(),
    chatId: integer("chat_id").notNull(),
    telegramMessageId: integer("telegram_message_id").notNull(),
    telegramUpdateId: integer("telegram_update_id").notNull(),
    kind: text("kind", { enum: telegramInboundKindValues }).notNull(),
    fileId: text("file_id"),
    transcription: text("transcription"),
    parsedItems: text("parsed_items"), // JSON
    status: text("status", { enum: telegramInboundStatusValues })
      .notNull()
      .default("pending"),
    syncError: text("sync_error"),
    expenseIds: text("expense_ids"), // JSON string[]
    messageAt: integer("message_at", { mode: "timestamp_ms" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    chatMessageUidx: uniqueIndex("telegram_inbound_messages_chat_message_uidx").on(
      t.chatId,
      t.telegramMessageId
    ),
    updateIdUidx: uniqueIndex("telegram_inbound_messages_update_id_uidx").on(
      t.telegramUpdateId
    ),
    chatStatusIdx: index("telegram_inbound_messages_chat_status_idx").on(
      t.chatId,
      t.status
    ),
    chatMessageIdIdx: index("telegram_inbound_messages_chat_message_id_idx").on(
      t.chatId,
      t.telegramMessageId
    ),
  })
);
