import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema/index.js";
import * as pgSchema from "./schema/pg/index.js";

type DbProvider = "sqlite" | "supabase";

function readProvider(): DbProvider {
  const raw = process.env.DB_PROVIDER;
  if (raw === "supabase") return "supabase";
  return "sqlite";
}

function createDb() {
  const provider = readProvider();

  if (provider === "supabase") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when DB_PROVIDER=supabase");
    }
    const pool = new pg.Pool({ connectionString });
    return drizzlePg(pool, { schema });
  }

  const sqlitePath = process.env.SQLITE_PATH;
  if (!sqlitePath) {
    throw new Error("SQLITE_PATH is required when DB_PROVIDER=sqlite");
  }

  const dir = path.dirname(sqlitePath);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const client = createClient({
    url: `file:${path.resolve(sqlitePath)}`,
  });
  return drizzleLibsql(client, { schema });
}

/**
 * Tipagem canônica em Postgres; em runtime o provider pode ser SQLite (LibSQL).
 * Os schemas pg/sqlite expõem as mesmas tabelas/colunas para os services.
 */
export type Database = NodePgDatabase<typeof pgSchema>;
export const db = createDb() as unknown as Database;
