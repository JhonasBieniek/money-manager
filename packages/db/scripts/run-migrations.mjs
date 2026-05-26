import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import pg from "pg";
import { config } from "dotenv";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsRoot = join(__dirname, "..", "migrations");

function findMonorepoRoot(startDir) {
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

const monorepoRoot = findMonorepoRoot(join(__dirname, "..", "..", ".."));
config({ path: join(monorepoRoot, ".env") });

const sqlitePath = process.env.SQLITE_PATH;
if (sqlitePath && !isAbsolute(sqlitePath)) {
  process.env.SQLITE_PATH = resolve(monorepoRoot, sqlitePath);
}

function readProvider() {
  const raw = process.env.DB_PROVIDER;
  if (raw === "supabase") return "supabase";
  return "sqlite";
}

const provider = readProvider();
console.log(`run-migrations: DB_PROVIDER=${provider}`);

async function runPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("run-migrations: DATABASE_URL is required when DB_PROVIDER=supabase");
    process.exit(1);
  }

  const migrationsFolder = join(migrationsRoot, "postgres");
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzlePg(pool);

  try {
    console.log(`run-migrations: postgres → ${migrationsFolder}`);
    await migratePg(db, { migrationsFolder });
    console.log("run-migrations: ok (postgres)");
  } finally {
    await pool.end();
  }
}

async function runSqlite() {
  const sqlitePath = process.env.SQLITE_PATH;
  if (!sqlitePath) {
    console.error("run-migrations: SQLITE_PATH is required when DB_PROVIDER=sqlite");
    process.exit(1);
  }

  const dir = dirname(sqlitePath);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const migrationsFolder = join(migrationsRoot, "sqlite");
  const client = createClient({ url: `file:${resolve(sqlitePath)}` });
  const db = drizzleLibsql(client);

  try {
    console.log(`run-migrations: sqlite (libsql) → ${resolve(sqlitePath)}`);
    await migrateLibsql(db, { migrationsFolder });
    console.log("run-migrations: ok (sqlite)");
  } finally {
    client.close();
  }
}

if (provider === "supabase") {
  await runPostgres();
} else {
  await runSqlite();
}
