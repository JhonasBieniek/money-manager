ALTER TABLE "debts" ADD COLUMN "payment_method" "payment_method" DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "credit_card_id" uuid;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;
