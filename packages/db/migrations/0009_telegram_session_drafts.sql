ALTER TABLE "telegram_bot_sessions"
ADD COLUMN "draft_items" jsonb NOT NULL DEFAULT '[]'::jsonb;
