import { execSync } from "node:child_process";
import { loadRepoEnv, resolveDatabaseUrl } from "./load-env";

export default async function globalSetup() {
  loadRepoEnv();
  const databaseUrl = resolveDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;

  console.log("[e2e] Running migrations…");
  execSync("pnpm --filter @money-manager/db run db:migrate:runtime", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
