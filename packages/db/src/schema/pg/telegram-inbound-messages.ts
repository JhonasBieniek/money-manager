import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const telegramInboundKindValues = ["voice", "audio", "photo"] as const;
export const telegramInboundStatusValues = [
  "pending",
  "synced",
  "failed",
  "partial",
] as const;

export const telegramInboundKindEnum = pgEnum(
  "telegram_inbound_kind",
  telegramInboundKindValues
);
export const telegramInboundStatusEnum = pgEnum(
  "telegram_inbound_status",
  telegramInboundStatusValues
);

export type ParsedExpenseItem = {
  amount?: number;
  description?: string;
  paymentMethod?: string;
};

export const telegramInboundMessages = pgTable(
  "telegram_inbound_messages",
  {
    id: uuid("id").primaryKey(),
    chatId: bigint("chat_id", { mode: "bigint" }).notNull(),
    telegramMessageId: bigint("telegram_message_id", { mode: "bigint" }).notNull(),
    telegramUpdateId: bigint("telegram_update_id", { mode: "bigint" }).notNull(),
    kind: telegramInboundKindEnum("kind").notNull(),
    fileId: text("file_id"),
    transcription: text("transcription"),
    parsedItems: jsonb("parsed_items").$type<ParsedExpenseItem[]>(),
    status: telegramInboundStatusEnum("status").notNull().default("pending"),
    syncError: text("sync_error"),
    expenseIds: jsonb("expense_ids").$type<string[]>(),
    messageAt: timestamp("message_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("telegram_inbound_messages_chat_message_uidx").on(
      t.chatId,
      t.telegramMessageId
    ),
    uniqueIndex("telegram_inbound_messages_update_id_uidx").on(t.telegramUpdateId),
    index("telegram_inbound_messages_chat_status_idx").on(t.chatId, t.status),
    index("telegram_inbound_messages_chat_message_id_idx").on(
      t.chatId,
      t.telegramMessageId
    ),
  ]
);
