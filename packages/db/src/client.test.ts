import { describe, expect, it } from "@jest/globals";
import { checkDbConnection } from "./client.js";

describe("db client", () => {
  it("SELECT 1 quando DATABASE_URL está definida", async () => {
    if (!process.env.DATABASE_URL) {
      return;
    }
    const ok = await checkDbConnection();
    expect(ok).toBe(true);
  });
});
