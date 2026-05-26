ALTER TYPE expense_source ADD VALUE 'telegram_voice';--> statement-breakpoint
ALTER TABLE expenses ALTER COLUMN goal_category DROP DEFAULT;--> statement-breakpoint
ALTER TABLE expenses ALTER COLUMN goal_category DROP NOT NULL;--> statement-breakpoint
CREATE TYPE telegram_inbound_status AS ENUM('pending', 'synced', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE telegram_inbound_kind AS ENUM('voice', 'audio', 'photo');--> statement-breakpoint
CREATE TABLE telegram_inbound_messages (
  id uuid PRIMARY KEY NOT NULL,
  chat_id bigint NOT NULL,
  telegram_message_id bigint NOT NULL,
  telegram_update_id bigint NOT NULL,
  kind telegram_inbound_kind NOT NULL,
  file_id text,
  transcription text,
  parsed_items jsonb,
  status telegram_inbound_status NOT NULL DEFAULT 'pending',
  sync_error text,
  expense_ids jsonb,
  message_at timestamptz NOT NULL,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telegram_inbound_messages_chat_message_uidx UNIQUE (chat_id, telegram_message_id),
  CONSTRAINT telegram_inbound_messages_update_id_uidx UNIQUE (telegram_update_id)
);--> statement-breakpoint
CREATE INDEX telegram_inbound_messages_chat_status_idx ON telegram_inbound_messages (chat_id, status);--> statement-breakpoint
CREATE INDEX telegram_inbound_messages_chat_message_id_idx ON telegram_inbound_messages (chat_id, telegram_message_id);
