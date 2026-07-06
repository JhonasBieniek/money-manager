CREATE TYPE "public"."telegram_bot_pending_action" AS ENUM('categorize', 'credit_card', 'tags', 'none');--> statement-breakpoint
ALTER TYPE "public"."telegram_inbound_kind" ADD VALUE 'text';--> statement-breakpoint
ALTER TABLE "telegram_inbound_messages" ADD COLUMN "retry_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_inbound_messages" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "telegram_bot_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"confirmation_message_id" bigint,
	"trigger_message_id" bigint,
	"expense_ids" jsonb NOT NULL,
	"pending_action" "telegram_bot_pending_action" DEFAULT 'categorize' NOT NULL,
	"pending_item_index" smallint DEFAULT 0 NOT NULL,
	"item_meta" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_bot_sessions_chat_id_uidx" ON "telegram_bot_sessions" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "telegram_bot_sessions_confirmation_idx" ON "telegram_bot_sessions" USING btree ("chat_id","confirmation_message_id");--> statement-breakpoint
CREATE INDEX "telegram_inbound_messages_retry_idx" ON "telegram_inbound_messages" USING btree ("status","next_retry_at");--> statement-breakpoint
ALTER TABLE "telegram_bot_sessions" ADD CONSTRAINT "telegram_bot_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
