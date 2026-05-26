CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`icon` text DEFAULT 'tag' NOT NULL,
	`is_system` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
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
	`deleted_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `expense_tags` (
	`expense_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`expense_id`, `tag_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `incomes` (
	`id` text PRIMARY KEY NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`source` text DEFAULT 'other' NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `income_tags` (
	`income_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`income_id`, `tag_id`),
	FOREIGN KEY (`income_id`) REFERENCES `incomes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`percentage` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` integer NOT NULL,
	`username` text,
	`linked_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_accounts_chat_id_unique` ON `telegram_accounts` (`chat_id`);
--> statement-breakpoint
CREATE INDEX `categories_deleted_idx` ON `categories` (`deleted_at`);
--> statement-breakpoint
CREATE INDEX `categories_name_idx` ON `categories` (`name`);
--> statement-breakpoint
CREATE INDEX `tags_deleted_idx` ON `tags` (`deleted_at`);
--> statement-breakpoint
CREATE INDEX `tags_parent_id_idx` ON `tags` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);
--> statement-breakpoint
CREATE INDEX `expenses_occurred_idx` ON `expenses` (`occurred_at`);
--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);
--> statement-breakpoint
CREATE INDEX `expenses_deleted_idx` ON `expenses` (`deleted_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_idempotency_key_uidx` ON `expenses` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `expense_tags_tag_id_idx` ON `expense_tags` (`tag_id`);
--> statement-breakpoint
CREATE INDEX `expense_tags_tag_expense_idx` ON `expense_tags` (`tag_id`,`expense_id`);
--> statement-breakpoint
CREATE INDEX `incomes_occurred_idx` ON `incomes` (`occurred_at`);
--> statement-breakpoint
CREATE INDEX `incomes_deleted_idx` ON `incomes` (`deleted_at`);
--> statement-breakpoint
CREATE INDEX `income_tags_tag_id_idx` ON `income_tags` (`tag_id`);
--> statement-breakpoint
CREATE INDEX `income_tags_income_tag_idx` ON `income_tags` (`income_id`,`tag_id`);
--> statement-breakpoint
CREATE INDEX `goals_category_idx` ON `goals` (`category`);
--> statement-breakpoint
CREATE INDEX `goals_active_idx` ON `goals` (`is_active`);
--> statement-breakpoint
CREATE INDEX `telegram_accounts_chat_id_idx` ON `telegram_accounts` (`chat_id`);
