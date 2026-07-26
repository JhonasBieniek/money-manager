CREATE TYPE "public"."installment_period" AS ENUM('daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."debt_status" AS ENUM('active', 'paid_off');--> statement-breakpoint
CREATE TYPE "public"."debt_installment_status" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"installment_count" integer NOT NULL,
	"installment_period" "installment_period" DEFAULT 'monthly' NOT NULL,
	"installment_cents" bigint NOT NULL,
	"total_cents" bigint NOT NULL,
	"interest_rate_monthly" numeric(8, 4) DEFAULT 0 NOT NULL,
	"auto_sync_expenses" boolean DEFAULT false NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"remaining_balance_cents" bigint NOT NULL,
	"status" "debt_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_installments" ADD CONSTRAINT "debt_installments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debts_user_id_idx" ON "debts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "debts_user_status_idx" ON "debts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "debt_installments_debt_id_idx" ON "debt_installments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "debt_installments_user_due_date_idx" ON "debt_installments" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_installments_debt_number_idx" ON "debt_installments" USING btree ("debt_id","installment_number");
