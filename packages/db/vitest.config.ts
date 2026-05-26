import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DB_PROVIDER: "sqlite",
      SQLITE_PATH: ":memory:",
    },
  },
});
