import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = join(__dirname, "..", "..", "..", ".env");
dotenv.config({ path: rootEnvPath });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("run-migrations: DATABASE_URL is required");
  process.exit(1);
}

const migrationsFolder = join(__dirname, "..", "migrations");

const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);

try {
  console.log(`run-migrations: applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });

  const {
    rows: [{ n }],
  } = await pool.query(`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'users'
      and table_type = 'BASE TABLE'
  `);

  if ((n ?? 0) === 0) {
    console.error(
      "run-migrations: public.users not found after migrate. Check DATABASE_URL and Postgres volume.",
    );
    process.exit(1);
  }

  console.log("run-migrations: ok");
} catch (error) {
  console.error("run-migrations: failed", error);
  process.exit(1);
} finally {
  await pool.end();
}
