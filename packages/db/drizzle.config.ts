import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}

const packageDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = findMonorepoRoot(join(packageDir, "..", ".."));
config({ path: join(monorepoRoot, ".env") });

const sqlitePath = process.env.SQLITE_PATH;
if (sqlitePath && !isAbsolute(sqlitePath)) {
  process.env.SQLITE_PATH = resolve(monorepoRoot, sqlitePath);
}

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
