ALTER TABLE expenses ALTER COLUMN goal_category DROP NOT NULL;--> statement-breakpoint
CREATE TYPE "public"."telegram_inbound_status" AS ENUM('pending', 'synced', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."telegram_inbound_kind" AS ENUM('voice', 'audio');--> statement-breakpoint
CREATE TABLE "telegram_inbound_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"telegram_message_id" bigint NOT NULL,
	"telegram_update_id" bigint NOT NULL,
	"kind" "telegram_inbound_kind" NOT NULL,
	"file_id" text,
	"transcription" text,
	"parsed_items" jsonb,
	"status" "telegram_inbound_status" DEFAULT 'pending' NOT NULL,
	"sync_error" text,
	"expense_ids" jsonb,
	"message_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_inbound_messages_chat_message_uidx" ON "telegram_inbound_messages" USING btree ("chat_id","telegram_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_inbound_messages_update_id_uidx" ON "telegram_inbound_messages" USING btree ("telegram_update_id");--> statement-breakpoint
CREATE INDEX "telegram_inbound_messages_chat_status_idx" ON "telegram_inbound_messages" USING btree ("chat_id","status");--> statement-breakpoint
CREATE INDEX "telegram_inbound_messages_chat_message_id_idx" ON "telegram_inbound_messages" USING btree ("chat_id","telegram_message_id");
