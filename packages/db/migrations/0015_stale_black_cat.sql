CREATE TYPE "public"."goal_category" AS ENUM('liberdade-financeira', 'custos-fixos', 'conforto', 'metas', 'prazeres', 'conhecimento');--> statement-breakpoint
CREATE TYPE "public"."expense_source" AS ENUM('manual', 'telegram_whisper', 'telegram_manual');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('credit_card', 'debit_card', 'pix', 'cash', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('open', 'closed', 'paid');--> statement-breakpoint
CREATE TYPE "public"."telegram_inbound_kind" AS ENUM('voice', 'audio', 'text');--> statement-breakpoint
CREATE TYPE "public"."telegram_inbound_status" AS ENUM('pending', 'synced', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."telegram_bot_pending_action" AS ENUM('categorize', 'payment_method', 'credit_card', 'tags', 'none');--> statement-breakpoint
CREATE TYPE "public"."debt_installment_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."debt_status" AS ENUM('active', 'paid_off');--> statement-breakpoint
CREATE TYPE "public"."installment_period" AS ENUM('daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."asset_class" AS ENUM('stocks', 'fii', 'fixed_income', 'crypto', 'fund', 'real_estate', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."income_type" AS ENUM('fixed_income', 'variable_income');--> statement-breakpoint
CREATE TYPE "public"."investment_account_type" AS ENUM('brokerage', 'crypto', 'fixed_income', 'pension', 'real_estate', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."pricing_source" AS ENUM('manual', 'brapi', 'coingecko', 'yahoo', 'alpha_vantage');--> statement-breakpoint
CREATE TYPE "public"."piggy_bank_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."piggy_bank_transaction_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "goal_category" NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_category" "goal_category",
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"card_last_four" char(4),
	"credit_card_id" uuid,
	"credit_card_statement_id" uuid,
	"source" "expense_source" DEFAULT 'manual' NOT NULL,
	"idempotency_key" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "expense_tags" (
	"expense_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "expense_tags_expense_id_tag_id_pk" PRIMARY KEY("expense_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"source" text DEFAULT 'other',
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "income_tags" (
	"income_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "income_tags_income_id_tag_id_pk" PRIMARY KEY("income_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" bigint NOT NULL,
	"username" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "telegram_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "telegram_accounts_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_link_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
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
	"retry_count" smallint DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_bot_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"confirmation_message_id" bigint,
	"trigger_message_id" bigint,
	"expense_ids" jsonb NOT NULL,
	"draft_items" jsonb NOT NULL,
	"pending_action" "telegram_bot_pending_action" DEFAULT 'categorize' NOT NULL,
	"pending_item_index" smallint DEFAULT 0 NOT NULL,
	"item_meta" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"last_four" char(4) NOT NULL,
	"due_day" smallint NOT NULL,
	"closing_day" smallint NOT NULL,
	"closing_offset_days" smallint DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_card_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"credit_card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle_year" integer NOT NULL,
	"cycle_month" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"calculated_total_cents" bigint DEFAULT 0 NOT NULL,
	"adjusted_total_cents" bigint,
	"status" "statement_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_installments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"debt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"status" "debt_installment_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"expense_id" uuid,
	"auto_sync_exempt" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"installment_count" integer NOT NULL,
	"installment_period" "installment_period" DEFAULT 'monthly' NOT NULL,
	"installment_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"auto_sync_expenses" boolean DEFAULT false NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"credit_card_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"remaining_balance_cents" bigint NOT NULL,
	"status" "debt_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "investment_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "investment_account_type" NOT NULL,
	"institution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "investment_holdings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"income_type" "income_type" DEFAULT 'fixed_income' NOT NULL,
	"asset_class" "asset_class",
	"quantity" numeric(18, 8) DEFAULT '1' NOT NULL,
	"average_cost_cents" bigint,
	"current_unit_value_cents" bigint NOT NULL,
	"maturity_date" date,
	"pricing_source" "pricing_source" DEFAULT 'manual' NOT NULL,
	"manual_override" boolean DEFAULT false NOT NULL,
	"last_valuation_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_quote_error" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "piggy_bank_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"piggy_bank_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "piggy_bank_transaction_type" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piggy_banks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"current_amount_cents" bigint DEFAULT 0 NOT NULL,
	"target_amount_cents" bigint,
	"goal_description" text,
	"target_date" date,
	"status" "piggy_bank_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_id_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_credit_card_statement_id_credit_card_statements_id_fk" FOREIGN KEY ("credit_card_statement_id") REFERENCES "public"."credit_card_statements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_tags" ADD CONSTRAINT "expense_tags_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_tags" ADD CONSTRAINT "expense_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_tags" ADD CONSTRAINT "income_tags_income_id_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."incomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_tags" ADD CONSTRAINT "income_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_bot_sessions" ADD CONSTRAINT "telegram_bot_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_account_id_investment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piggy_bank_transactions" ADD CONSTRAINT "piggy_bank_transactions_piggy_bank_id_piggy_banks_id_fk" FOREIGN KEY ("piggy_bank_id") REFERENCES "public"."piggy_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piggy_bank_transactions" ADD CONSTRAINT "piggy_bank_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piggy_banks" ADD CONSTRAINT "piggy_banks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_expires_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "tags_user_id_idx" ON "tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tags_parent_id_idx" ON "tags" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tags_user_deleted_idx" ON "tags" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "goals_user_id_idx" ON "goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goals_user_category_idx" ON "goals" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "expenses_user_id_idx" ON "expenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "expenses_user_occurred_idx" ON "expenses" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "expenses_user_goal_category_idx" ON "expenses" USING btree ("user_id","goal_category");--> statement-breakpoint
CREATE INDEX "expenses_goal_category_idx" ON "expenses" USING btree ("goal_category");--> statement-breakpoint
CREATE INDEX "expenses_user_deleted_idx" ON "expenses" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "expenses_credit_card_id_idx" ON "expenses" USING btree ("credit_card_id");--> statement-breakpoint
CREATE INDEX "expenses_credit_card_statement_id_idx" ON "expenses" USING btree ("credit_card_statement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_user_idempotency_uidx" ON "expenses" USING btree ("user_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "expense_tags_tag_id_idx" ON "expense_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "expense_tags_expense_id_idx" ON "expense_tags" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "incomes_user_id_idx" ON "incomes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "incomes_user_occurred_idx" ON "incomes" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "incomes_user_deleted_idx" ON "incomes" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "income_tags_tag_id_idx" ON "income_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "income_tags_income_id_idx" ON "income_tags" USING btree ("income_id");--> statement-breakpoint
CREATE INDEX "telegram_accounts_chat_id_idx" ON "telegram_accounts" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_inbound_messages_chat_message_uidx" ON "telegram_inbound_messages" USING btree ("chat_id","telegram_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_inbound_messages_update_id_uidx" ON "telegram_inbound_messages" USING btree ("telegram_update_id");--> statement-breakpoint
CREATE INDEX "telegram_inbound_messages_chat_status_idx" ON "telegram_inbound_messages" USING btree ("chat_id","status");--> statement-breakpoint
CREATE INDEX "telegram_inbound_messages_chat_message_id_idx" ON "telegram_inbound_messages" USING btree ("chat_id","telegram_message_id");--> statement-breakpoint
CREATE INDEX "telegram_inbound_messages_retry_idx" ON "telegram_inbound_messages" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_bot_sessions_chat_id_uidx" ON "telegram_bot_sessions" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "telegram_bot_sessions_confirmation_idx" ON "telegram_bot_sessions" USING btree ("chat_id","confirmation_message_id");--> statement-breakpoint
CREATE INDEX "credit_cards_user_id_idx" ON "credit_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_cards_user_deleted_idx" ON "credit_cards" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_statements_card_cycle_uidx" ON "credit_card_statements" USING btree ("credit_card_id","cycle_year","cycle_month");--> statement-breakpoint
CREATE INDEX "credit_card_statements_card_status_idx" ON "credit_card_statements" USING btree ("credit_card_id","status");--> statement-breakpoint
CREATE INDEX "credit_card_statements_user_id_idx" ON "credit_card_statements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "debt_installments_debt_id_idx" ON "debt_installments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "debt_installments_user_due_date_idx" ON "debt_installments" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_installments_debt_number_idx" ON "debt_installments" USING btree ("debt_id","installment_number");--> statement-breakpoint
CREATE INDEX "debts_user_id_idx" ON "debts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "debts_user_status_idx" ON "debts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "investment_accounts_user_id_idx" ON "investment_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investment_holdings_account_id_idx" ON "investment_holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "investment_holdings_user_id_idx" ON "investment_holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "piggy_bank_transactions_piggy_bank_id_idx" ON "piggy_bank_transactions" USING btree ("piggy_bank_id");--> statement-breakpoint
CREATE INDEX "piggy_bank_transactions_user_id_idx" ON "piggy_bank_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "piggy_banks_user_id_idx" ON "piggy_banks" USING btree ("user_id");