import { describe, expect, it } from "vitest";
import { registerBodySchema } from "./modules/auth/auth.schema.js";

describe("@money-manager/api", () => {
  it("validates register body schema", () => {
    const parsed = registerBodySchema.parse({
      email: "a@b.com",
      password: "12345678",
    });
    expect(parsed.email).toBe("a@b.com");
  });
});
