CREATE TYPE "public"."expense_source" AS ENUM('manual', 'telegram_ocr', 'telegram_manual');--> statement-breakpoint
CREATE TYPE "public"."ocr_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('credit_card', 'debit_card', 'pix', 'cash', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."goal_category" AS ENUM('liberdade-financeira', 'custos-fixos', 'conforto', 'metas', 'prazeres', 'conhecimento');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"icon" text DEFAULT 'tag' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_id" uuid,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"establishment" text,
	"payment_method" "payment_method" DEFAULT 'credit_card' NOT NULL,
	"card_last_four" char(4),
	"source" "expense_source" DEFAULT 'manual' NOT NULL,
	"ocr_status" "ocr_status",
	"idempotency_key" text,
	"ocr_raw" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "expense_tags" (
	"expense_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "expense_tags_expense_id_tag_id_pk" PRIMARY KEY("expense_id","tag_id")
);--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"source" text DEFAULT 'other' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "income_tags" (
	"income_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "income_tags_income_id_tag_id_pk" PRIMARY KEY("income_id","tag_id")
);--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category" "goal_category" NOT NULL,
	"percentage" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "telegram_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"username" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "telegram_accounts_chat_id_unique" UNIQUE("chat_id")
);--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_id_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_tags" ADD CONSTRAINT "expense_tags_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_tags" ADD CONSTRAINT "expense_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_tags" ADD CONSTRAINT "income_tags_income_id_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."incomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_tags" ADD CONSTRAINT "income_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_deleted_idx" ON "categories" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "categories_name_idx" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "tags_deleted_idx" ON "tags" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "tags_parent_id_idx" ON "tags" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tags_name_idx" ON "tags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "expenses_occurred_idx" ON "expenses" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "expenses_deleted_idx" ON "expenses" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_idempotency_key_uidx" ON "expenses" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "expense_tags_tag_id_idx" ON "expense_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "expense_tags_tag_expense_idx" ON "expense_tags" USING btree ("tag_id","expense_id");--> statement-breakpoint
CREATE INDEX "incomes_occurred_idx" ON "incomes" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "incomes_deleted_idx" ON "incomes" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "income_tags_tag_id_idx" ON "income_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "income_tags_income_tag_idx" ON "income_tags" USING btree ("income_id","tag_id");--> statement-breakpoint
CREATE INDEX "goals_category_idx" ON "goals" USING btree ("category");--> statement-breakpoint
CREATE INDEX "goals_active_idx" ON "goals" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "telegram_accounts_chat_id_idx" ON "telegram_accounts" USING btree ("chat_id");
