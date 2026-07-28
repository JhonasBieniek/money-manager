CREATE TYPE "public"."asset_class" AS ENUM('stocks', 'fii', 'fixed_income', 'crypto', 'fund', 'real_estate', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."income_type" AS ENUM('fixed_income', 'variable_income');--> statement-breakpoint
CREATE TYPE "public"."investment_account_type" AS ENUM('brokerage', 'crypto', 'fixed_income', 'pension', 'real_estate', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."pricing_source" AS ENUM('manual', 'brapi', 'coingecko', 'yahoo', 'alpha_vantage');--> statement-breakpoint
CREATE TYPE "public"."piggy_bank_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."piggy_bank_transaction_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
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
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_account_id_investment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piggy_banks" ADD CONSTRAINT "piggy_banks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piggy_bank_transactions" ADD CONSTRAINT "piggy_bank_transactions_piggy_bank_id_piggy_banks_id_fk" FOREIGN KEY ("piggy_bank_id") REFERENCES "public"."piggy_banks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piggy_bank_transactions" ADD CONSTRAINT "piggy_bank_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_accounts_user_id_idx" ON "investment_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investment_holdings_account_id_idx" ON "investment_holdings" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "investment_holdings_user_id_idx" ON "investment_holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "piggy_banks_user_id_idx" ON "piggy_banks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "piggy_bank_transactions_piggy_bank_id_idx" ON "piggy_bank_transactions" USING btree ("piggy_bank_id");--> statement-breakpoint
CREATE INDEX "piggy_bank_transactions_user_id_idx" ON "piggy_bank_transactions" USING btree ("user_id");