CREATE TABLE "investment_quote_cache" (
	"symbol" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"unit_value_cents" bigint NOT NULL,
	"pricing_source" "pricing_source" NOT NULL,
	"quoted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"raw_response" jsonb,
	CONSTRAINT "investment_quote_cache_symbol_asset_class_pk" PRIMARY KEY("symbol","asset_class")
);
