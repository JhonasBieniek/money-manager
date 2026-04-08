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
    const user = decodeURIComponent(u.username || "");
    console.log(
      `run-migrations: target host=${u.hostname} port=${u.port || "5432"} db=${dbName} user=${user || "(none)"}`
    );
  } catch {
    console.log("run-migrations: target (parse URL failed, check DATABASE_URL)");
  }
}

async function logSessionIdentity(pool) {
  const {
    rows: [row],
  } = await pool.query(
    `select current_database() as db, current_user as role, session_user as session`
  );
  console.log(
    `run-migrations: session db=${row.db} current_user=${row.role} session_user=${row.session}`
  );
}

async function countPublicBaseTables(pool) {
  const {
    rows: [{ n }],
  } = await pool.query(`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `);
  return n ?? 0;
}

async function countDrizzleMetaRows(pool) {
  try {
    const {
      rows: [{ n }],
    } = await pool.query(
      `select count(*)::int as n from drizzle.__drizzle_migrations`
    );
    return n ?? 0;
  } catch {
    return 0;
  }
}

async function hasPublicUsersTable(pool) {
  const {
    rows: [{ n }],
  } = await pool.query(`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'users'
      and table_type = 'BASE TABLE'
  `);
  return (n ?? 0) > 0;
}

const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);

try {
  logTargetDb(url);
  console.log(`run-migrations: migrationsFolder=${migrationsFolder}`);

  try {
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")
    );
    const entries = journal.entries ?? [];
    console.log(
      `run-migrations: journal entries=${entries.length} tags=${entries.map((e) => e.tag).join(", ")}`
    );
  } catch (e) {
    console.error("run-migrations: could not read meta/_journal.json", e);
    process.exit(1);
  }

  await logSessionIdentity(pool);

  const metaBefore = await countDrizzleMetaRows(pool);
  const publicTablesBefore = await countPublicBaseTables(pool);
  const usersBefore = await hasPublicUsersTable(pool);

  if (metaBefore > 0) {
    console.log(
      `run-migrations: drizzle.__drizzle_migrations rows=${metaBefore} public base tables=${publicTablesBefore} public.users=${usersBefore}`
    );
  }

  // Drizzle pula o DDL se já existe linha com created_at >= when do journal, mesmo sem tabelas em public.
  if (metaBefore > 0 && !usersBefore) {
    console.warn(
      "run-migrations: meta órfã (registros em drizzle mas sem public.users); DROP SCHEMA drizzle CASCADE e reaplicando"
    );
    await pool.query(`drop schema if exists drizzle cascade`);
  }

  await migrate(db, { migrationsFolder });

  const metaAfter = await countDrizzleMetaRows(pool);
  const publicTablesAfter = await countPublicBaseTables(pool);
  console.log(
    `run-migrations: after migrate meta_rows=${metaAfter} public_base_tables=${publicTablesAfter}`
  );

  const usersOk = await hasPublicUsersTable(pool);
  if (!usersOk) {
    console.error(
      "run-migrations: public.users não existe após migrate. Verifique:"
    );
    console.error(
      "  - Mesmo host/db/user que no Coolify (veja logs session db/current_user acima)."
    );
    console.error(
      "  - No cliente SQL: use o mesmo usuário de DATABASE_URL; information_schema só lista tabelas acessíveis ao role da sessão."
    );
    console.error("  - Se meta voltou órfã, inspecione logs e volume do Postgres.");
    process.exit(1);
  }

  console.log("run-migrations: ok (public.users existe; contagem via information_schema)");
} finally {
  await pool.end();
}
