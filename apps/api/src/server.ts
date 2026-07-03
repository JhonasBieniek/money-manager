import "dotenv/config";
import { waitForDbConnection } from "@money-manager/db";
import { getJwtAccessSecret, getJwtRefreshSecret } from "./config/secrets.js";
import { createApp } from "./app.js";

async function main(): Promise<void> {
  getJwtAccessSecret();
  getJwtRefreshSecret();

  if (process.env.DATABASE_URL?.trim()) {
    await waitForDbConnection();
  }

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "0.0.0.0";
  const app = createApp();

  app.listen(port, host, () => {
    console.log(`api listening on http://${host}:${port}`);
  });
}

main().catch((error: unknown) => {
  console.error("[API] failed to start", error);
  process.exit(1);
});
