import { describe, expect, it } from "vitest";
import { users } from "./schema/users.js";

describe("@money-manager/db", () => {
  it("exports schema symbols", () => {
    expect(users).toBeDefined();
  });
});
