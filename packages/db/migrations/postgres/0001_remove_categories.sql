ALTER TABLE "public"."expenses" DROP CONSTRAINT IF EXISTS "expenses_category_id_categories_id_fk";
ALTER TABLE "public"."expenses" DROP COLUMN IF EXISTS "category_id";
DROP TABLE IF EXISTS "public"."categories";

DROP INDEX IF EXISTS "public"."expenses_category_idx";
