import fs from "node:fs";
import path from "node:path";

/** Carrega `.env` da raiz do repo sem sobrescrever variáveis já definidas no shell. */
export function loadRepoEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export const DEFAULT_E2E_DATABASE_URL =
  "postgresql://money_manager:changeme@localhost:15432/money_manager";

export function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || DEFAULT_E2E_DATABASE_URL;
}
