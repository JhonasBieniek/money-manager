import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("run-migrations: DATABASE_URL is required");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, "..", "migrations");

function logTargetDb(connectionString) {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, "http:"));
    const dbName = u.pathname.replace(/^\//, "").split("/")[0] || "(default)";
    console.log(
      `run-migrations: target host=${u.hostname} port=${u.port || "5432"} db=${dbName}`
    );
  } catch {
    console.log("run-migrations: target (parse URL failed, check DATABASE_URL)");
  }
}

const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);

try {
  logTargetDb(url);
  console.log(`run-migrations: migrationsFolder=${migrationsFolder}`);

  let journalEntries = [];
  try {
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")
    );
    journalEntries = journal.entries ?? [];
    console.log(
      `run-migrations: journal entries=${journalEntries.length} tags=${journalEntries.map((e) => e.tag).join(", ")}`
    );
  } catch (e) {
    console.error("run-migrations: could not read meta/_journal.json", e);
    process.exit(1);
  }

  let metaBefore = [];
  try {
    const { rows } = await pool.query(
      `select id, hash, created_at from drizzle.__drizzle_migrations order by created_at asc`
    );
    metaBefore = rows;
    if (rows.length) {
      console.log(
        `run-migrations: drizzle.__drizzle_migrations before migrate: ${rows.length} row(s)`
      );
    }
  } catch {
    // schema/tabela ainda não existem — esperado na primeira carga
  }

  await migrate(db, { migrationsFolder });

  const { rows: metaAfter } = await pool.query(
    `select id, hash, created_at from drizzle.__drizzle_migrations order by created_at asc`
  );
  console.log(
    `run-migrations: drizzle.__drizzle_migrations after migrate: ${metaAfter.length} row(s)`
  );

  const { rows: usersCheck } = await pool.query(`
    select exists(
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'users'
    ) as ok
  `);

  if (!usersCheck[0]?.ok) {
    console.error(
      "run-migrations: public.users não existe após migrate. Possíveis causas:"
    );
    console.error(
      "  - DATABASE_URL aponta para outro banco/host do que você inspeciona no cliente SQL."
    );
    console.error(
      "  - Há linhas em drizzle.__drizzle_migrations com created_at igual ao 'when' do journal; o Drizzle pula o SQL nesse caso (use: DROP SCHEMA drizzle CASCADE; e rode de novo, ou restaure o banco limpo)."
    );
    console.error("  - Estado atual meta:", JSON.stringify(metaAfter));
    process.exit(1);
  }

  console.log("run-migrations: ok (public.users presente)");
} finally {
  await pool.end();
}
