import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { loadRepoEnv, resolveDatabaseUrl } from "./load-env";

loadRepoEnv();

const repoRoot = process.cwd();
const e2eDir = path.join(repoRoot, "e2e");

/** Mesmo host em web + API — cookies CSRF exigem localhost (não misturar com 127.0.0.1). */
const e2eHost = process.env.E2E_HOST ?? "localhost";
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiPort = Number(process.env.E2E_API_PORT ?? 3001);
const baseURL = process.env.E2E_BASE_URL ?? `http://${e2eHost}:${webPort}`;
const apiURL = `http://${e2eHost}:${apiPort}`;
const databaseUrl = resolveDatabaseUrl();

const testEnv: Record<string, string> = {
  NODE_ENV: "test",
  API_PORT: String(apiPort),
  API_HOST: e2eHost,
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET:
    process.env.JWT_ACCESS_SECRET ??
    "e2e-access-secret-min-32-characters-long-here",
  JWT_REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET ??
    "e2e-refresh-secret-min-32-characters-long-here",
  CORS_ORIGINS: baseURL,
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "e2e-internal-key-change-me",
  RUN_DB_MIGRATIONS: "false",
};

export default defineConfig({
  testDir: e2eDir,
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(e2eDir, "test-results"),
  reporter: process.env.CI
    ? [
        ["github"],
        [
          "html",
          {
            outputFolder: path.join(e2eDir, "playwright-report"),
            open: "never",
          },
        ],
      ]
    : [
        ["list"],
        [
          "html",
          {
            outputFolder: path.join(e2eDir, "playwright-report"),
            open: "never",
          },
        ],
      ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: path.join(e2eDir, "global-setup.ts"),
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: "pnpm --filter @money-manager/api exec tsx src/server.ts",
          url: `${apiURL}/health`,
          cwd: repoRoot,
          reuseExistingServer: process.env.E2E_REUSE_SERVERS === "1",
          timeout: 120_000,
          env: {
            ...process.env,
            ...testEnv,
          },
        },
        {
          command: `pnpm --filter @money-manager/web exec vite --host ${e2eHost} --port ${webPort}`,
          url: baseURL,
          cwd: repoRoot,
          reuseExistingServer: process.env.E2E_REUSE_SERVERS === "1",
          timeout: 120_000,
          env: {
            ...process.env,
            VITE_API_URL: apiURL,
          },
        },
      ],
});
