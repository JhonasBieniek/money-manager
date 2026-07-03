CREATE TYPE "public"."statement_status" AS ENUM('open', 'closed', 'paid');--> statement-breakpoint
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
ALTER TABLE "expenses" ADD COLUMN "credit_card_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "credit_card_statement_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_statements" ADD CONSTRAINT "credit_card_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_credit_card_statement_id_credit_card_statements_id_fk" FOREIGN KEY ("credit_card_statement_id") REFERENCES "public"."credit_card_statements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_cards_user_id_idx" ON "credit_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_cards_user_deleted_idx" ON "credit_cards" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_statements_card_cycle_uidx" ON "credit_card_statements" USING btree ("credit_card_id","cycle_year","cycle_month");--> statement-breakpoint
CREATE INDEX "credit_card_statements_card_status_idx" ON "credit_card_statements" USING btree ("credit_card_id","status");--> statement-breakpoint
CREATE INDEX "credit_card_statements_user_id_idx" ON "credit_card_statements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "expenses_credit_card_id_idx" ON "expenses" USING btree ("credit_card_id");--> statement-breakpoint
CREATE INDEX "expenses_credit_card_statement_id_idx" ON "expenses" USING btree ("credit_card_statement_id");
