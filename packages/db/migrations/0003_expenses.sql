CREATE TYPE "public"."payment_method" AS ENUM('credit_card', 'debit_card', 'pix', 'cash', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_source" AS ENUM('manual', 'telegram_whisper', 'telegram_manual');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_category" "goal_category" NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"card_last_four" char(4),
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
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_tags" ADD CONSTRAINT "expense_tags_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_tags" ADD CONSTRAINT "expense_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_user_id_idx" ON "expenses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "expenses_user_occurred_idx" ON "expenses" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "expenses_user_goal_category_idx" ON "expenses" USING btree ("user_id","goal_category");--> statement-breakpoint
CREATE INDEX "expenses_goal_category_idx" ON "expenses" USING btree ("goal_category");--> statement-breakpoint
CREATE INDEX "expenses_user_deleted_idx" ON "expenses" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_user_idempotency_uidx" ON "expenses" USING btree ("user_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "expense_tags_tag_id_idx" ON "expense_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "expense_tags_expense_id_idx" ON "expense_tags" USING btree ("expense_id");
