import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT, ".env.example");

function parseArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (key === "yes") {
      out.set("yes", "true");
      continue;
    }
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) continue;
    out.set(key, val);
    i++;
  }
  return out;
}

function parseEnvFile(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (key) out.set(key, value);
  }
  return out;
}

function serializeEnv(map) {
  const keys = [...map.keys()].sort();
  return `${keys.map((k) => `${k}=${map.get(k) ?? ""}`).join("\n")}\n`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function main() {
  if (!fs.existsSync(ENV_EXAMPLE_PATH)) {
    console.error("setup: .env.example não encontrado.");
    process.exit(1);
  }

  const exampleText = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
  const base = parseEnvFile(exampleText);
  const args = parseArgs(process.argv.slice(2));

  // Defaults
  if (!base.has("NODE_ENV")) base.set("NODE_ENV", "development");
  if (!base.has("API_HOST")) base.set("API_HOST", "0.0.0.0");
  if (!base.has("API_PORT")) base.set("API_PORT", "3001");
  if (!base.has("NEXT_PUBLIC_API_URL")) base.set("NEXT_PUBLIC_API_URL", "http://localhost:3001");

  const nonInteractiveProvider = args.get("provider");
  const nonInteractiveYes = args.get("yes") === "true";
  const isNonInteractive = Boolean(nonInteractiveProvider);

  const rl = isNonInteractive
    ? null
    : readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

  try {
    console.log("");
    console.log("money-manager setup");
    console.log("------------------");
    const provider = isNonInteractive
      ? (nonInteractiveProvider === "supabase" ? "supabase" : "sqlite")
      : (() => {
          console.log("Escolha o provider de banco:");
          console.log("1) SQLite (local, arquivo na máquina)");
          console.log("2) Supabase/Postgres (DATABASE_URL)");
          console.log("");
          return null;
        })();

    const chosenProvider =
      provider ??
      (((await rl.question("Opção (1/2) [1]: ")).trim() || "1") === "2"
        ? "supabase"
        : "sqlite");

    base.set("DB_PROVIDER", chosenProvider);

    if (chosenProvider === "sqlite") {
      const dataDir = path.join(ROOT, "data");
      ensureDir(dataDir);

      const defaultSqlitePath = "./data/money-manager.sqlite";
      const p = isNonInteractive
        ? (args.get("sqlite-path") ?? defaultSqlitePath)
        : (await rl.question(`SQLITE_PATH [${defaultSqlitePath}]: `)).trim() ||
          defaultSqlitePath;
      base.set("SQLITE_PATH", p);
      // DATABASE_URL não é usado em sqlite, mas manter no arquivo não atrapalha.
    } else {
      const current = base.get("DATABASE_URL") ?? "";
      const p = isNonInteractive
        ? (args.get("database-url") ?? "")
        : (await rl.question(`DATABASE_URL [${current || "cole aqui"}]: `)).trim();
      if (p) base.set("DATABASE_URL", p);
      if (!base.get("DATABASE_URL")) {
        console.error("setup: DATABASE_URL é obrigatório para Supabase/Postgres.");
        process.exit(1);
      }
    }

    // Não sobrescrever um .env existente sem confirmação
    if (fs.existsSync(ENV_PATH)) {
      const overwrite = isNonInteractive
        ? (nonInteractiveYes ? "s" : "")
        : (await rl.question(".env já existe. Sobrescrever? (s/N): "))
            .trim()
            .toLowerCase();
      if (overwrite !== "s" && overwrite !== "sim" && overwrite !== "y" && overwrite !== "yes") {
        console.log("setup: abortado (não sobrescrevi o .env).");
        return;
      }
    }

    fs.writeFileSync(ENV_PATH, serializeEnv(base), "utf8");
    console.log(`setup: ok → ${ENV_PATH}`);

    console.log("setup: rodando migrações (db:migrate)...");
    const migrateRes = spawnSync(
      "pnpm",
      ["run", "db:migrate"],
      {
        cwd: ROOT,
        stdio: "inherit",
      }
    );
    if (migrateRes.status !== 0) {
      throw new Error(
        `setup: falha ao executar migrações (exit code ${migrateRes.status ?? "unknown"})`
      );
    }
    console.log("setup: migrações ok");
    console.log("setup: próximos passos: pnpm dev");
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("setup: erro inesperado", err);
  process.exit(1);
});

