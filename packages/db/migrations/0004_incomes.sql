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
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "incomes_user_id_idx" ON "incomes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "incomes_user_occurred_idx" ON "incomes" USING btree ("user_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "incomes_user_deleted_idx" ON "incomes" USING btree ("user_id","deleted_at");
--> statement-breakpoint
CREATE TABLE "income_tags" (
	"income_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "income_tags_income_id_tag_id_pk" PRIMARY KEY("income_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "income_tags" ADD CONSTRAINT "income_tags_income_id_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."incomes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "income_tags" ADD CONSTRAINT "income_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "income_tags_tag_id_idx" ON "income_tags" USING btree ("tag_id");
--> statement-breakpoint
CREATE INDEX "income_tags_income_id_idx" ON "income_tags" USING btree ("income_id");
