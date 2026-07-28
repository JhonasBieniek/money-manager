CREATE TYPE "public"."benchmark_type" AS ENUM('ipca', 'cdi');--> statement-breakpoint
CREATE TABLE "benchmark_rates" (
	"benchmark" "benchmark_type" NOT NULL,
	"reference_month" date NOT NULL,
	"monthly_rate_pct" numeric(10, 4) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "benchmark_rates_benchmark_reference_month_pk" PRIMARY KEY("benchmark","reference_month")
);
--> statement-breakpoint
CREATE TABLE "investment_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_assets_cents" bigint NOT NULL,
	"by_asset_class" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investment_snapshots" ADD CONSTRAINT "investment_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_snapshots_user_id_idx" ON "investment_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_snapshots_user_date_idx" ON "investment_snapshots" USING btree ("user_id","snapshot_date");