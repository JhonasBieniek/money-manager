import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("run-migrations: DATABASE_URL is required");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, "..", "migrations");

const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder });
  console.log("run-migrations: ok");
} finally {
  await pool.end();
}
