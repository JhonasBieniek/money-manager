import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const telegramBotPendingActionValues = [
  "categorize",
  "payment_method",
  "credit_card",
  "tags",
  "none",
] as const;

export type TelegramBotPendingAction =
  (typeof telegramBotPendingActionValues)[number];

export const telegramBotPendingActionEnum = pgEnum(
  "telegram_bot_pending_action",
  telegramBotPendingActionValues,
);

export type SessionItemMeta = {
  paymentMethod: "pix" | "credit_card" | "cash";
  goalCategoryResolved: boolean;
  paymentMethodResolved: boolean;
  creditCardResolved: boolean;
  tagsResolved: boolean;
};

export type DraftExpenseItem = {
  amountCents: number;
  description: string;
  goalCategory: string | null;
  paymentMethod: "pix" | "credit_card" | "cash";
  creditCardId: string | null;
  tagIds: string[];
  occurredAt: string;
  source: "telegram_whisper" | "telegram_manual";
};

export const telegramBotSessions = pgTable(
  "telegram_bot_sessions",
  {
    id: uuid("id").primaryKey(),
    chatId: bigint("chat_id", { mode: "bigint" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    confirmationMessageId: bigint("confirmation_message_id", {
      mode: "bigint",
    }),
    triggerMessageId: bigint("trigger_message_id", { mode: "bigint" }),
    expenseIds: jsonb("expense_ids").$type<string[]>().notNull(),
    draftItems: jsonb("draft_items").$type<DraftExpenseItem[]>().notNull(),
    pendingAction: telegramBotPendingActionEnum("pending_action")
      .notNull()
      .default("categorize"),
    pendingItemIndex: smallint("pending_item_index").notNull().default(0),
    itemMeta: jsonb("item_meta").$type<SessionItemMeta[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("telegram_bot_sessions_chat_id_uidx").on(t.chatId),
    index("telegram_bot_sessions_confirmation_idx").on(
      t.chatId,
      t.confirmationMessageId,
    ),
  ],
);
