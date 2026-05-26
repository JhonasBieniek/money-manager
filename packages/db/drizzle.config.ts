import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const provider = process.env.DB_PROVIDER === "supabase" ? "supabase" : "sqlite";

export default defineConfig(
  provider === "supabase"
    ? {
        schema: "./src/schema/pg/index.ts",
        out: "./migrations/postgres",
        dialect: "postgresql",
        dbCredentials: {
          url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/postgres",
        },
      }
    : {
        schema: "./src/schema/sqlite/index.ts",
        out: "./migrations/sqlite",
        dialect: "sqlite",
        dbCredentials: {
          url: process.env.SQLITE_PATH ?? "./data/money-manager.sqlite",
        },
      }
);
