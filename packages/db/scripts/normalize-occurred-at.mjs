/**
 * Corrige occurred_at salvos como meia-noite UTC (dia anterior no Brasil).
 * Uso: pnpm --filter @money-manager/db exec node ./scripts/normalize-occurred-at.mjs
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, "..", "..", "..");
config({ path: resolve(monorepoRoot, ".env") });

function isUtcMidnight(date) {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

function fixUtcMidnight(ms) {
  const d = new Date(ms);
  if (!isUtcMidnight(d)) return ms;
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    12,
    0,
    0,
    0
  ).getTime();
}

async function main() {
  const sqlitePath = process.env.SQLITE_PATH;
  if (!sqlitePath) {
    console.error("SQLITE_PATH não definido no .env");
    process.exit(1);
  }

  const resolved = resolve(monorepoRoot, sqlitePath);
  const dir = dirname(resolved);
  if (!existsSync(resolved)) {
    console.error(`Banco não encontrado: ${resolved}`);
    process.exit(1);
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const client = createClient({ url: `file:${resolved}` });

  for (const table of ["expenses", "incomes"]) {
    const { rows } = await client.execute(`SELECT id, occurred_at FROM ${table}`);
    let updated = 0;

    for (const row of rows) {
      const id = row.id;
      const ms = Number(row.occurred_at);
      const fixed = fixUtcMidnight(ms);
      if (fixed !== ms) {
        await client.execute({
          sql: `UPDATE ${table} SET occurred_at = ? WHERE id = ?`,
          args: [fixed, id],
        });
        updated++;
      }
    }

    console.log(`${table}: ${updated} registro(s) corrigido(s)`);
  }

  client.close();
  console.log("normalize-occurred-at: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
