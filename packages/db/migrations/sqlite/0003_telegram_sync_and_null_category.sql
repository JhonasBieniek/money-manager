PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `expenses_new` (
	`id` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`goal_category` text,
	`establishment` text,
	`payment_method` text DEFAULT 'credit_card' NOT NULL,
	`card_last_four` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`ocr_status` text,
	`idempotency_key` text,
	`ocr_raw` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);--> statement-breakpoint
INSERT INTO `expenses_new` (
  id, amount_cents, description, goal_category, establishment, payment_method,
  card_last_four, source, ocr_status, idempotency_key, ocr_raw, occurred_at,
  created_at, updated_at, deleted_at
)
SELECT
  id, amount_cents, description, goal_category, establishment, payment_method,
  card_last_four, source, ocr_status, idempotency_key, ocr_raw, occurred_at,
  created_at, updated_at, deleted_at
FROM `expenses`;--> statement-breakpoint
DROP TABLE `expenses`;--> statement-breakpoint
ALTER TABLE `expenses_new` RENAME TO `expenses`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `expenses_occurred_idx` ON `expenses` (`occurred_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `expenses_goal_category_idx` ON `expenses` (`goal_category`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `expenses_deleted_idx` ON `expenses` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `expenses_idempotency_key_uidx` ON `expenses` (`idempotency_key`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE telegram_inbound_messages (
  id text PRIMARY KEY NOT NULL,
  chat_id integer NOT NULL,
  telegram_message_id integer NOT NULL,
  telegram_update_id integer NOT NULL,
  kind text NOT NULL,
  file_id text,
  transcription text,
  parsed_items text,
  status text NOT NULL DEFAULT 'pending',
  sync_error text,
  expense_ids text,
  message_at integer NOT NULL,
  synced_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX telegram_inbound_messages_chat_message_uidx ON telegram_inbound_messages (chat_id, telegram_message_id);--> statement-breakpoint
CREATE UNIQUE INDEX telegram_inbound_messages_update_id_uidx ON telegram_inbound_messages (telegram_update_id);--> statement-breakpoint
CREATE INDEX telegram_inbound_messages_chat_status_idx ON telegram_inbound_messages (chat_id, status);--> statement-breakpoint
CREATE INDEX telegram_inbound_messages_chat_message_id_idx ON telegram_inbound_messages (chat_id, telegram_message_id);
